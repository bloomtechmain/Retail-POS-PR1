import { PoolClient } from 'pg';
import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { round2, round3, consumeFifoBatches } from '../utils/helpers';
import { CreateVatInvoicePayload, Sale } from '../types';

// Strictly sequential, gap-free invoice number: increments a single-row
// counter under a row lock held for the rest of this transaction, so a
// rolled-back sale (e.g. stock/credit-limit failure) never consumes a
// number — required for VAT-compliant numbering.
const allocateVatInvoiceNumber = async (client: PoolClient): Promise<string> => {
  const result = await client.query(
    `UPDATE vat_invoice_counter SET next_number = next_number + 1 WHERE id = 1 RETURNING next_number - 1 AS assigned`
  );
  const assigned = result.rows[0].assigned as number;
  return `VAT-${String(assigned).padStart(6, '0')}`;
};

export const createVatInvoice = async (data: CreateVatInvoicePayload, cashierId: number): Promise<Sale> => {
  return transaction(async (client: PoolClient) => {
    // A tax invoice is legally required to show the supplier's own address,
    // telephone, and TIN — refuse to issue one until the business profile
    // in Settings has all three filled in, rather than printing a document
    // with blank/"-" supplier details.
    const settingsResult = await client.query('SELECT address, phone, vat_registration_number FROM settings WHERE id = 1');
    const biz = settingsResult.rows[0];
    const missing: string[] = [];
    if (!biz?.address?.trim()) missing.push('Address');
    if (!biz?.phone?.trim()) missing.push('Telephone');
    if (!biz?.vat_registration_number?.trim()) missing.push('TIN Number');
    if (missing.length > 0) {
      throw createError(
        `Supplier details required: fill in your business ${missing.join(', ')} in Settings before creating a Tax Invoice.`,
        400
      );
    }

    const shiftResult = await client.query(
      `SELECT id FROM shifts WHERE opened_by = $1 AND status = 'open' ORDER BY open_time DESC LIMIT 1`,
      [cashierId]
    );
    if (shiftResult.rows.length === 0) {
      throw createError('No open shift found. Please open a shift first.', 400);
    }
    const shiftId = shiftResult.rows[0].id;

    let customer: any = null;
    if (data.payment_method === 'credit') {
      if (!data.customer_id) {
        throw createError('Select a customer for credit (pay later) sales', 400);
      }
      const customerResult = await client.query(
        'SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [data.customer_id]
      );
      if (customerResult.rows.length === 0) throw createError('Customer not found', 404);
      customer = customerResult.rows[0];
      if (!customer.is_active) throw createError('This customer account is inactive', 400);
    }

    if (!data.cart_items || data.cart_items.length === 0) {
      throw createError('Add at least one item', 400);
    }

    let subtotal = 0;
    let itemDiscountTotal = 0;
    let taxTotal = 0;
    let costTotal = 0;

    const processedItems: any[] = [];

    for (const item of data.cart_items) {
      const productResult = await client.query(
        'SELECT id, avg_cost, current_stock, allow_negative_stock, costing_method FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );
      if (productResult.rows.length === 0) {
        throw createError(`Product ${item.product_id} not found`, 404);
      }
      const product = productResult.rows[0];
      const avgCost = parseFloat(product.avg_cost) || 0;

      const costPrice = product.costing_method === 'fifo'
        ? await consumeFifoBatches(client, item.product_id, item.quantity, avgCost)
        : (avgCost || item.cost_price || 0);

      const clampedItemDiscount = Math.min(item.item_discount, item.unit_price);
      const lineSubtotal = round2(item.unit_price * item.quantity);
      const lineDiscount = round2(clampedItemDiscount * item.quantity);
      const taxableAmount = lineSubtotal - lineDiscount;

      // Each selected tax is computed independently on the same taxable
      // amount and summed (additive, not compounded) — e.g. VAT 15% + NBT
      // 2.5% on the same base, not tax-on-tax.
      const appliedTaxes = (item.taxes || []).map((t) => {
        const amount = round2((taxableAmount * t.rate) / 100);
        return { tax_rate_id: t.tax_rate_id ?? null, name: t.name, rate: t.rate, amount };
      });
      const lineTax = round2(appliedTaxes.reduce((s, t) => s + t.amount, 0));
      const combinedRate = round2(appliedTaxes.reduce((s, t) => s + Number(t.rate), 0));
      const lineTotal = round2(taxableAmount + lineTax);

      subtotal += lineSubtotal;
      itemDiscountTotal += lineDiscount;
      taxTotal += lineTax;
      costTotal += round2(costPrice * item.quantity);

      const balanceBefore = parseFloat(product.current_stock);
      const balanceAfter = round3(balanceBefore - item.quantity);

      if (!product.allow_negative_stock && balanceAfter < 0) {
        throw createError(
          `Not enough stock for "${item.product_name}" (available: ${balanceBefore}, requested: ${item.quantity})`,
          400
        );
      }

      await client.query(
        'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2',
        [balanceAfter, item.product_id]
      );

      processedItems.push({
        ...item,
        item_discount: clampedItemDiscount,
        cost_price: costPrice,
        combined_rate: combinedRate,
        line_tax: lineTax,
        line_subtotal: lineTotal,
        applied_taxes: appliedTaxes,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
      });
    }

    const maxBillDiscount = Math.max(0, round2(subtotal - itemDiscountTotal));
    const billDiscountAmount = Math.min(round2(data.bill_discount || 0), maxBillDiscount);
    const discountTotal = round2(itemDiscountTotal + billDiscountAmount);
    const totalAmount = Math.max(0, round2(subtotal - discountTotal + taxTotal));
    const profit = round2(totalAmount - costTotal);
    const changeAmount = round2(
      data.payment_method === 'cash'
        ? Math.max(0, data.cash_tendered - totalAmount)
        : data.payment_method === 'mixed'
        ? Math.max(0, data.cash_tendered + data.card_amount - totalAmount)
        : 0
    );

    if (customer && customer.credit_limit !== null) {
      const newBalance = round2(parseFloat(customer.current_balance) + totalAmount);
      const creditLimit = parseFloat(customer.credit_limit);
      if (newBalance > creditLimit) {
        const available = round2(creditLimit - parseFloat(customer.current_balance));
        throw createError(
          `Credit limit exceeded for ${customer.name}. Available credit: ${available.toFixed(2)}`,
          400
        );
      }
    }

    // Allocated last, right before the insert it belongs to, so the
    // no-gaps guarantee holds even if an earlier check in this function
    // throws (the whole transaction — including this counter bump —
    // rolls back together).
    const vatInvoiceNumber = await allocateVatInvoiceNumber(client);
    const saleNumber = vatInvoiceNumber;

    const saleResult = await client.query(
      `INSERT INTO sales (
         sale_number, shift_id, cashier_id, subtotal, item_discount, bill_discount,
         discount_amount, tax_amount, total_amount, cost_total, profit,
         payment_method, cash_tendered, card_amount, change_amount,
         status, customer_name, customer_id, notes,
         is_vat_invoice, vat_invoice_number, buyer_vat_reg_no,
         buyer_address, buyer_phone, delivery_date, place_of_supply
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'completed',$16,$17,$18,TRUE,$19,$20,$21,$22,$23,$24)
       RETURNING *`,
      [
        saleNumber, shiftId, cashierId, subtotal, itemDiscountTotal, billDiscountAmount,
        discountTotal, taxTotal, totalAmount, costTotal, profit,
        data.payment_method, data.cash_tendered || 0, data.card_amount || 0, changeAmount,
        customer ? customer.name : (data.customer_name || null), customer ? customer.id : null, data.notes || null,
        vatInvoiceNumber, data.buyer_vat_reg_no || null,
        data.buyer_address || (customer ? customer.address : null) || null,
        data.buyer_phone || (customer ? customer.phone : null) || null,
        data.delivery_date || null, data.place_of_supply || null,
      ]
    );

    const sale = saleResult.rows[0];

    if (customer) {
      await client.query(
        'UPDATE customers SET current_balance = current_balance + $1, updated_at = NOW() WHERE id = $2',
        [totalAmount, customer.id]
      );
    }

    for (const item of processedItems) {
      const siResult = await client.query(
        `INSERT INTO sale_items (
           sale_id, product_id, product_name, barcode, quantity,
           unit_price, original_price, cost_price, item_discount,
           tax_rate, tax_amount, subtotal, promotion_id
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id`,
        [
          sale.id, item.product_id, item.product_name, item.barcode || null, item.quantity,
          item.unit_price, item.original_price, item.cost_price, item.item_discount || 0,
          item.combined_rate, item.line_tax,
          item.line_subtotal, item.promotion_id || null,
        ]
      );
      const saleItemId = siResult.rows[0].id;

      for (const t of item.applied_taxes) {
        await client.query(
          `INSERT INTO sale_item_taxes (sale_item_id, tax_rate_id, tax_name, tax_rate, tax_amount)
           VALUES ($1,$2,$3,$4,$5)`,
          [saleItemId, t.tax_rate_id, t.name, t.rate, t.amount]
        );
      }

      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, balance_before, balance_after, unit_cost, reference_type, reference_id, created_by)
         VALUES ($1,'sale_out',$2,$3,$4,$5,'sale',$6,$7)`,
        [item.product_id, item.quantity, item.balance_before, item.balance_after, item.cost_price, sale.id, cashierId]
      );
    }

    await client.query(
      `UPDATE shifts SET
         total_sales = total_sales + $1,
         total_cash_sales = total_cash_sales + $2,
         total_card_sales = total_card_sales + $3,
         total_transactions = total_transactions + 1
       WHERE id = $4`,
      [
        totalAmount,
        (data.payment_method === 'cash' || data.payment_method === 'mixed') ? round2(data.cash_tendered - changeAmount) : 0,
        (data.payment_method === 'card' || data.payment_method === 'mixed') ? data.card_amount : 0,
        shiftId,
      ]
    );

    return sale;
  });
};

export const getVatInvoices = async (params: { page?: number; limit?: number }) => {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  const countResult = await query(`SELECT COUNT(*) FROM sales WHERE is_vat_invoice = TRUE`, []);
  const dataResult = await query(
    `SELECT s.*, u.name as cashier_name
     FROM sales s JOIN users u ON s.cashier_id = u.id
     WHERE s.is_vat_invoice = TRUE
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
