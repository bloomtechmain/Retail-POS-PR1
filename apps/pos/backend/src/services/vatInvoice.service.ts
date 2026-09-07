import { PoolClient } from 'pg';
import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { round2 } from '../utils/helpers';
import { GenerateVatInvoicePayload, Sale } from '../types';

// Strictly sequential, gap-free invoice number: increments a single-row
// counter under a row lock held for the rest of this transaction, so a
// rolled-back generation attempt never consumes a number — required for
// VAT-compliant numbering.
const allocateVatInvoiceNumber = async (client: PoolClient): Promise<string> => {
  const result = await client.query(
    `UPDATE vat_invoice_counter SET next_number = next_number + 1 WHERE id = 1 RETURNING next_number - 1 AS assigned`
  );
  const assigned = result.rows[0].assigned as number;
  return `VAT-${String(assigned).padStart(6, '0')}`;
};

// Sales marked as a VAT invoice at checkout (POS.tsx's "Mark as VAT
// Invoice" toggle, or the same on a held-order settle) but not yet
// generated — the queue the VAT Invoice page's cashier picks from.
export const getVatPendingSales = async () => {
  const result = await query(
    `SELECT s.id, s.sale_number, s.total_amount, s.customer_name, s.customer_id, s.created_at, u.name as cashier_name
     FROM sales s
     JOIN users u ON s.cashier_id = u.id
     WHERE s.is_vat_invoice = TRUE AND s.vat_invoice_number IS NULL AND s.status = 'completed'
     ORDER BY s.created_at DESC`,
    []
  );
  return result.rows;
};

// The "generate" step: assigns named tax(es) per item for the invoice's
// printed breakdown, records buyer details, and allocates the invoice
// number. Deliberately does NOT touch total_amount/tax_amount/change —
// the customer already paid that amount at checkout; this only documents
// which taxes make it up, which is a compliance/formatting concern, not a
// re-charge. If a business's prices need to change based on tax selection,
// that has to happen before checkout (via product tax_rate / promotions),
// not retroactively here.
export const generateVatInvoice = async (saleId: number, data: GenerateVatInvoicePayload): Promise<Sale> => {
  return transaction(async (client: PoolClient) => {
    const settingsResult = await client.query('SELECT address, phone, vat_registration_number FROM settings WHERE id = 1');
    const biz = settingsResult.rows[0];
    const missing: string[] = [];
    if (!biz?.address?.trim()) missing.push('Address');
    if (!biz?.phone?.trim()) missing.push('Telephone');
    if (!biz?.vat_registration_number?.trim()) missing.push('TIN Number');
    if (missing.length > 0) {
      throw createError(
        `Supplier details required: fill in your business ${missing.join(', ')} in Settings before generating a Tax Invoice.`,
        400
      );
    }

    const saleResult = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND status = 'completed' AND is_vat_invoice = TRUE FOR UPDATE`,
      [saleId]
    );
    if (saleResult.rows.length === 0) throw createError('VAT-eligible sale not found', 404);
    const sale = saleResult.rows[0];
    if (sale.vat_invoice_number) throw createError('An invoice has already been generated for this sale', 400);

    let customer: any = null;
    if (data.customer_id) {
      const customerResult = await client.query('SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL', [data.customer_id]);
      if (customerResult.rows.length === 0) throw createError('Customer not found', 404);
      customer = customerResult.rows[0];
    }

    const itemsResult = await client.query('SELECT * FROM sale_items WHERE sale_id = $1', [saleId]);
    const items = itemsResult.rows;

    const taxIdsFor = (saleItemId: number): number[] => {
      if (data.tax_mode === 'uniform') return data.uniform_tax_ids || [];
      return (data.item_taxes || []).find((it) => it.sale_item_id === saleItemId)?.tax_ids || [];
    };

    const allTaxIds = Array.from(new Set(items.flatMap((i: any) => taxIdsFor(i.id))));
    const taxRatesById = new Map<number, { id: number; name: string; rate: number }>();
    if (allTaxIds.length > 0) {
      const taxRatesResult = await client.query('SELECT id, name, rate FROM tax_rates WHERE id = ANY($1)', [allTaxIds]);
      for (const tr of taxRatesResult.rows) taxRatesById.set(tr.id, tr);
    }

    for (const item of items) {
      for (const taxId of taxIdsFor(item.id)) {
        const tr = taxRatesById.get(taxId);
        if (!tr) continue;
        const taxAmount = round2((parseFloat(item.subtotal) * Number(tr.rate)) / 100);
        await client.query(
          `INSERT INTO sale_item_taxes (sale_item_id, tax_rate_id, tax_name, tax_rate, tax_amount)
           VALUES ($1,$2,$3,$4,$5)`,
          [item.id, tr.id, tr.name, tr.rate, taxAmount]
        );
      }
    }

    const vatInvoiceNumber = await allocateVatInvoiceNumber(client);

    const updated = await client.query(
      `UPDATE sales SET
         vat_invoice_number = $1, buyer_vat_reg_no = $2, buyer_address = $3, buyer_phone = $4,
         delivery_date = $5, place_of_supply = $6,
         customer_id = COALESCE($7, customer_id), customer_name = COALESCE($8, customer_name),
         updated_at = NOW()
       WHERE id = $9 RETURNING *`,
      [
        vatInvoiceNumber,
        data.buyer_vat_reg_no || (customer ? customer.vat_reg_no : null) || null,
        data.buyer_address || (customer ? customer.address : null) || null,
        data.buyer_phone || (customer ? customer.phone : null) || null,
        data.delivery_date || null,
        data.place_of_supply || null,
        data.customer_id || null,
        customer ? customer.name : (data.customer_name || null),
        saleId,
      ]
    );

    return updated.rows[0];
  });
};

export const getVatInvoices = async (params: { page?: number; limit?: number }) => {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  const countResult = await query(`SELECT COUNT(*) FROM sales WHERE is_vat_invoice = TRUE AND vat_invoice_number IS NOT NULL`, []);
  const dataResult = await query(
    `SELECT s.*, u.name as cashier_name
     FROM sales s JOIN users u ON s.cashier_id = u.id
     WHERE s.is_vat_invoice = TRUE AND s.vat_invoice_number IS NOT NULL
     ORDER BY s.created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );

  const total = parseInt(countResult.rows[0].count);
  return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getVatInvoiceById = async (id: number): Promise<Sale> => {
  const saleResult = await query(
    `SELECT s.*, u.name as cashier_name
     FROM sales s JOIN users u ON s.cashier_id = u.id
     WHERE s.id = $1 AND s.is_vat_invoice = TRUE`,
    [id]
  );
  if (saleResult.rows.length === 0) throw createError('VAT invoice not found', 404);

  const itemsResult = await query(`SELECT * FROM sale_items WHERE sale_id = $1`, [id]);
  const items = itemsResult.rows;

  if (items.length > 0) {
    const taxesResult = await query(
      `SELECT * FROM sale_item_taxes WHERE sale_item_id = ANY($1) ORDER BY id ASC`,
      [items.map((i: any) => i.id)]
    );
    const taxesByItem = new Map<number, any[]>();
    for (const t of taxesResult.rows) {
      const list = taxesByItem.get(t.sale_item_id) || [];
      list.push(t);
      taxesByItem.set(t.sale_item_id, list);
    }
    for (const item of items) {
      item.taxes = taxesByItem.get(item.id) || [];
    }
  }

  return { ...saleResult.rows[0], items };
};
