import { v4 as uuidv4 } from 'uuid';
import { PoolClient } from 'pg';

export const generateSaleNumber = (): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `INV-${date}-${rand}`;
};

export const generateGRNNumber = (): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `GRN-${date}-${rand}`;
};

export const generateReturnNumber = (): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `RET-${date}-${rand}`;
};

export const generateShiftNumber = (): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 900) + 100;
  return `SHF-${date}-${rand}`;
};

export const generateSKU = (): string => {
  return `SKU-${uuidv4().slice(0, 8).toUpperCase()}`;
};

// Random, not sequential/guessable — these get handed out individually as
// single-use discount codes, unlike the human-entered codes createCoupon
// takes verbatim from the admin.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I — easy to misread
export const generateCouponCode = (): string => {
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
};

export const generateBatchNumber = (): string => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, '');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `BATCH-${date}-${rand}`;
};

export const round2 = (value: number): number => {
  return Math.round(value * 100) / 100;
};

// Matches the DECIMAL(12,3) precision used for stock quantity/balance columns —
// round2 would silently truncate gram/millilitre-level precision.
export const round3 = (value: number): number => {
  return Math.round(value * 1000) / 1000;
};

export const calculateWeightedAvgCost = (
  currentStock: number,
  currentAvgCost: number,
  newQty: number,
  newCost: number
): number => {
  const totalQty = currentStock + newQty;
  if (totalQty <= 0) return newCost;
  const totalValue = currentStock * currentAvgCost + newQty * newCost;
  return round2(totalValue / totalQty);
};

// Consumes stock from a FIFO/FEFO product's open batches (nearest-expiry-first
// when a batch has an expiry date, oldest-received-first otherwise), locking
// them under the caller's already-held product-row lock. Returns the blended
// per-unit cost of what was actually consumed. If the open batches don't cover
// the full quantity (legacy un-batched stock, or overselling into negative
// stock), the shortfall is priced at `fallbackUnitCost` (pass the product's
// avg_cost — always available, kept live by the unconditional GRN blend).
export const consumeFifoBatches = async (
  client: PoolClient,
  productId: number,
  quantity: number,
  fallbackUnitCost: number
): Promise<number> => {
  const result = await client.query(
    `SELECT id, quantity_remaining, unit_cost FROM product_batches
     WHERE product_id = $1 AND quantity_remaining > 0
     ORDER BY (expiry_date IS NULL), expiry_date ASC, created_at ASC, id ASC
     FOR UPDATE`,
    [productId]
  );

  let remaining = quantity;
  let totalCost = 0;

  for (const batch of result.rows) {
    if (remaining <= 0) break;
    const available = parseFloat(batch.quantity_remaining);
    const take = Math.min(available, remaining);
    totalCost += take * parseFloat(batch.unit_cost);
    remaining = round3(remaining - take);
    await client.query(
      'UPDATE product_batches SET quantity_remaining = quantity_remaining - $1 WHERE id = $2',
      [take, batch.id]
    );
  }

  if (remaining > 0) {
    totalCost += remaining * fallbackUnitCost;
  }

  return quantity > 0 ? round2(totalCost / quantity) : 0;
};

// Consumes a quantity from ONE specific batch a cashier explicitly picked
// (the multi-batch picker in POS.tsx), instead of consumeFifoBatches'
// automatic oldest/nearest-expiry-first selection. Errors rather than
// partially fulfilling if the batch doesn't belong to this product or
// doesn't have enough left — a picked batch is a firm choice, not a
// fallback source to blend with others.
export const consumeSpecificBatch = async (
  client: PoolClient,
  productId: number,
  batchId: number,
  quantity: number
): Promise<{ unitCost: number; sellingPrice: number | null }> => {
  const result = await client.query(
    `SELECT product_id, quantity_remaining, unit_cost, selling_price FROM product_batches
     WHERE id = $1 FOR UPDATE`,
    [batchId]
  );
  if (result.rows.length === 0) throw new Error('Selected batch not found');
  const batch = result.rows[0];
  if (batch.product_id !== productId) throw new Error('Selected batch does not belong to this product');

  const available = parseFloat(batch.quantity_remaining);
  if (available < quantity) {
    throw new Error(`Only ${available} left in the selected batch`);
  }

  await client.query(
    'UPDATE product_batches SET quantity_remaining = quantity_remaining - $1 WHERE id = $2',
    [quantity, batchId]
  );

  return {
    unitCost: parseFloat(batch.unit_cost),
    sellingPrice: batch.selling_price !== null ? parseFloat(batch.selling_price) : null,
  };
};

// Creates a new batch for a FIFO/FEFO product — used by GRN receiving,
// void/return restocking, and inventory-adjustment increases.
export const addBatch = async (
  client: PoolClient,
  params: {
    productId: number;
    grnItemId?: number | null;
    quantity: number;
    unitCost: number;
    sellingPrice?: number | null;
    expiryDate?: string | null;
    receivedDate?: string;
  }
): Promise<void> => {
  await client.query(
    `INSERT INTO product_batches
       (product_id, grn_item_id, batch_number, quantity_received, quantity_remaining, unit_cost, selling_price, expiry_date, received_date)
     VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8)`,
    [
      params.productId,
      params.grnItemId || null,
      generateBatchNumber(),
      params.quantity,
      params.unitCost,
      params.sellingPrice ?? null,
      params.expiryDate || null,
      params.receivedDate || new Date().toISOString().slice(0, 10),
    ]
  );
};
