import { PoolClient } from 'pg';
import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { generateSaleNumber, generateReturnNumber, round2, round3, calculateWeightedAvgCost, consumeFifoBatches, addBatch } from '../utils/helpers';
import {
  Sale, CreateSalePayload, SaleReturn, ReturnSaleItemsPayload,
  CreateHeldSalePayload, CompleteHeldSalePayload,
} from '../types';
import { planIncludes, DEFAULT_PLAN_KEY } from '../data/plans';
import { redeemCoupon } from './coupon.service';
import { setTableStatus } from './table.service';

// Shared by createSale/createHeldSale/addItemsToSale — one locked pass per
// item: lock the product row, determine its cost (FIFO batch consumption is
// a real mutation and must happen under this same lock, not as a separate
// unlocked lookup), and mutate stock right here too. Callers do a second,
// lighter pass to write sale_items/stock_movements using what's already
// been decided — no re-querying or re-locking products there.
const processCartItems = async (
  client: PoolClient,
  cartItems: CreateSalePayload['cart_items'],
  canOverridePrice: boolean
) => {
  // A zero/negative quantity inverts every downstream calculation — stock
  // goes UP instead of down, and totals go negative — so it must never
  // reach the pricing/stock logic below at all, regardless of role.
  for (const item of cartItems) {
    if (!(item.quantity > 0)) {
      throw createError(`Invalid quantity for "${item.product_name}" — must be greater than zero`, 400);
    }
  }

  let subtotal = 0;
  let itemDiscountTotal = 0;
  let taxTotal = 0;
  let costTotal = 0;

  const processedItems = [];

  for (const item of cartItems) {
    const productResult = await client.query(
      'SELECT id, selling_price, avg_cost, current_stock, allow_negative_stock, costing_method FROM products WHERE id = $1 FOR UPDATE',
      [item.product_id]
    );
    if (productResult.rows.length === 0) {
      throw createError(`Product ${item.product_id} not found`, 404);
    }
    const product = productResult.rows[0];
    const avgCost = parseFloat(product.avg_cost) || 0;

    // A cashier without price_override must sell at the product's real
    // price — item-level/bill-level discounts (below) are the sanctioned
    // way prices move, not a client-supplied unit_price. Without this
    // check, any authenticated user could set unit_price to whatever they
    // want, permission shown in their own token or not.
    if (!canOverridePrice) {
      const realPrice = round2(parseFloat(product.selling_price));
      if (round2(item.unit_price) !== realPrice) {
        throw createError(
          `You don't have permission to change the price of "${item.product_name}"`,
          403
        );
      }
    }

    const costPrice = product.costing_method === 'fifo'
      ? await consumeFifoBatches(client, item.product_id, item.quantity, avgCost)
      : (avgCost || item.cost_price || 0);

    // Clamp per-unit discount to the unit price — stacked promotions or a
    // manual override must never push a line's taxable amount negative.
    const clampedItemDiscount = Math.min(item.item_discount, item.unit_price);
    const lineSubtotal = round2(item.unit_price * item.quantity);
    const lineDiscount = round2(clampedItemDiscount * item.quantity);
    const taxableAmount = lineSubtotal - lineDiscount;
    const lineTax = round2((taxableAmount * item.tax_rate) / 100);
    const lineTotal = round2(taxableAmount + lineTax);

    subtotal += lineSubtotal;
    itemDiscountTotal += lineDiscount;
    taxTotal += lineTax;
    costTotal += round2(costPrice * item.quantity);

    // Stock mutation, under the lock already held above.
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
      line_subtotal: lineTotal,
      line_tax: lineTax,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
    });
  }

  return { processedItems, subtotal, itemDiscountTotal, taxTotal, costTotal };
};

// Shared insert loop for sale_items + stock_movements — used by every path
// that writes cart lines (createSale, createHeldSale, addItemsToSale).
const insertSaleItems = async (
  client: PoolClient,
  saleId: number,
  processedItems: Awaited<ReturnType<typeof processCartItems>>['processedItems'],
  cashierId: number
) => {
  for (const item of processedItems) {
    await client.query(
      `INSERT INTO sale_items (
         sale_id, product_id, product_name, barcode, quantity,
         unit_price, original_price, cost_price, item_discount,
         tax_rate, tax_amount, subtotal, promotion_id
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        saleId, item.product_id, item.product_name, item.barcode || null, item.quantity,
        item.unit_price, item.original_price, item.cost_price, item.item_discount || 0,
        item.tax_rate || 0, item.line_tax,
        item.line_subtotal, item.promotion_id || null,
      ]
    );

    await client.query(
      `INSERT INTO stock_movements
         (product_id, movement_type, quantity, balance_before, balance_after, unit_cost, reference_type, reference_id, created_by)
       VALUES ($1,'sale_out',$2,$3,$4,$5,'sale',$6,$7)`,
      [item.product_id, item.quantity, item.balance_before, item.balance_after, item.cost_price, saleId, cashierId]
    );
  }
};

export const createSale = async (
  data: CreateSalePayload,
  cashierId: number,
  canOverridePrice: boolean
): Promise<Sale> => {
  return transaction(async (client: PoolClient) => {
    // Get active shift for cashier
    const shiftResult = await client.query(
      `SELECT id FROM shifts WHERE opened_by = $1 AND status = 'open' ORDER BY open_time DESC LIMIT 1`,
      [cashierId]
    );
    if (shiftResult.rows.length === 0) {
      throw createError('No open shift found. Please open a shift first.', 400);
    }
    const shiftId = shiftResult.rows[0].id;

    // Credit sales require a registered customer
    let customer: any = null;
    if (data.payment_method === 'credit') {
      const settingsResult = await client.query('SELECT plan_key, custom_features FROM settings WHERE id = 1');
      const planKey = settingsResult.rows[0]?.plan_key || DEFAULT_PLAN_KEY;
      const customFeatures = settingsResult.rows[0]?.custom_features ?? null;
      if (!planIncludes(planKey, 'customers', customFeatures)) {
        throw createError('Credit sales require the Customers feature, which isn\'t included in your current plan.', 403);
      }
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

    const { processedItems, subtotal, itemDiscountTotal, taxTotal, costTotal } =
      await processCartItems(client, data.cart_items, canOverridePrice);

    // Bill discount can never exceed what's left after item-level discounts —
    // otherwise the total goes negative and "change" gets fabricated from nothing.
    const maxBillDiscount = Math.max(0, round2(subtotal - itemDiscountTotal));
    const billDiscountAmount = Math.min(round2(data.bill_discount || 0), maxBillDiscount);

    // A coupon code replaces (never stacks with) whatever item-level
    // promotion discounts the frontend already applied to the cart before
    // submission — the cashier UI is responsible for clearing an active
    // promotion when a coupon is entered (see posStore's applyCoupon).
    // The server never trusts a client-supplied discount amount for a
    // coupon, only the code — redeemCoupon looks the code up itself, locks
    // it, and computes the discount fresh against what's actually left
    // after item/bill discounts.
    let couponId: number | null = null;
    let couponDiscountAmount = 0;
    if (data.coupon_code) {
      const remaining = Math.max(0, round2(subtotal - itemDiscountTotal - billDiscountAmount));
      const redeemed = await redeemCoupon(client, data.coupon_code, remaining, data.customer_id ?? null);
      couponId = redeemed.couponId;
      couponDiscountAmount = redeemed.discountAmount;
    }

    const discountTotal = round2(itemDiscountTotal + billDiscountAmount + couponDiscountAmount);
    const totalAmount = Math.max(0, round2(subtotal - discountTotal + taxTotal));
    const profit = round2(totalAmount - costTotal);
    const changeAmount = round2(
      data.payment_method === 'cash'
        ? Math.max(0, data.cash_tendered - totalAmount)
        : data.payment_method === 'mixed'
        ? Math.max(0, data.cash_tendered + data.card_amount - totalAmount)
        : 0
    );

    // Enforce credit limit (null limit = unlimited)
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

    const saleNumber = generateSaleNumber();

    // Insert sale
    const saleResult = await client.query(
      `INSERT INTO sales (
         sale_number, shift_id, cashier_id, subtotal, item_discount, bill_discount,
         discount_amount, tax_amount, total_amount, cost_total, profit,
         payment_method, cash_tendered, card_amount, change_amount,
         status, customer_name, customer_id, notes, coupon_id, coupon_discount,
         table_id, order_type, is_vat_invoice
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'completed',$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING *`,
      [
        saleNumber, shiftId, cashierId, subtotal, itemDiscountTotal, billDiscountAmount,
        discountTotal, taxTotal, totalAmount, costTotal, profit,
        data.payment_method, data.cash_tendered || 0, data.card_amount || 0, changeAmount,
        customer ? customer.name : (data.customer_name || null), customer ? customer.id : null, data.notes || null,
        couponId, couponDiscountAmount,
        data.table_id || null, data.order_type || 'retail', data.is_vat_invoice === true,
      ]
    );

    const sale = saleResult.rows[0];

    // Credit sale: increase customer's outstanding balance
    if (customer) {
      await client.query(
        'UPDATE customers SET current_balance = current_balance + $1, updated_at = NOW() WHERE id = $2',
        [totalAmount, customer.id]
      );
    }

    // Insert sale items and stock movements — everything was already determined
    // and locked/mutated in the pass above, so no product re-query here.
    await insertSaleItems(client, sale.id, processedItems, cashierId);

    // Update shift totals
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

// ─── Restaurant Mode: held-order lifecycle ─────────────────────────────────
// A held order runs the exact same stock-lock/deduct pass as a normal sale
// (createSale above) — the difference is entirely in what happens around
// it: status='held' instead of 'completed', and the shift-total update is
// deferred to completeHeldSale so an order sitting open on a table never
// inflates "today's revenue" before it's actually paid for.

export const createHeldSale = async (
  data: CreateHeldSalePayload,
  cashierId: number,
  canOverridePrice: boolean
): Promise<Sale> => {
  return transaction(async (client: PoolClient) => {
    const shiftResult = await client.query(
      `SELECT id FROM shifts WHERE opened_by = $1 AND status = 'open' ORDER BY open_time DESC LIMIT 1`,
      [cashierId]
    );
    if (shiftResult.rows.length === 0) {
      throw createError('No open shift found. Please open a shift first.', 400);
    }
    const shiftId = shiftResult.rows[0].id;

    // A plain retail hold ("park this bill, start a new one") needs no
    // special plan feature — it's basic till functionality. Only
    // dine_in/takeaway/delivery are gated, since those imply Restaurant
    // Mode; the frontend already only ever reaches this with a non-retail
    // order_type when restaurant_mode_enabled is on, but this is the real
    // enforcement point, not just a UI nicety.
    if (data.order_type !== 'retail') {
      const settingsResult = await client.query('SELECT plan_key, custom_features FROM settings WHERE id = 1');
      const planKey = settingsResult.rows[0]?.plan_key || DEFAULT_PLAN_KEY;
      const customFeatures = settingsResult.rows[0]?.custom_features ?? null;
      if (!planIncludes(planKey, 'restaurant_mode', customFeatures)) {
        throw createError('Restaurant Mode isn\'t included in your current plan.', 403);
      }
    }

    if (data.table_id) {
      const tableResult = await client.query('SELECT status FROM tables WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [data.table_id]);
      if (tableResult.rows.length === 0) throw createError('Table not found', 404);
      if (tableResult.rows[0].status === 'occupied') throw createError('This table already has an open order', 400);
    }

    const { processedItems, subtotal, itemDiscountTotal, taxTotal, costTotal } =
      await processCartItems(client, data.cart_items, canOverridePrice);

    const totalAmount = Math.max(0, round2(subtotal - itemDiscountTotal + taxTotal));
    const profit = round2(totalAmount - costTotal);
    const saleNumber = generateSaleNumber();

    const saleResult = await client.query(
      `INSERT INTO sales (
         sale_number, shift_id, cashier_id, subtotal, item_discount, bill_discount,
         discount_amount, tax_amount, total_amount, cost_total, profit,
         payment_method, status, customer_name, customer_id, notes, table_id, order_type
       ) VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8,$9,$10,'cash','held',$11,$12,$13,$14,$15)
       RETURNING *`,
      [
        saleNumber, shiftId, cashierId, subtotal, itemDiscountTotal,
        itemDiscountTotal, taxTotal, totalAmount, costTotal, profit,
        data.customer_name || null, data.customer_id || null, data.notes || null,
        data.table_id || null, data.order_type,
      ]
    );
    const sale = saleResult.rows[0];

    await insertSaleItems(client, sale.id, processedItems, cashierId);

    if (data.table_id) {
      await setTableStatus(client, data.table_id, 'occupied');
    }

    return sale;
  });
};

export const addItemsToSale = async (
  saleId: number,
  newItems: CreateSalePayload['cart_items'],
  cashierId: number,
  canOverridePrice: boolean
): Promise<Sale> => {
  return transaction(async (client: PoolClient) => {
    const saleResult = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND status = 'held' FOR UPDATE`,
      [saleId]
    );
    if (saleResult.rows.length === 0) throw createError('Held order not found', 404);
    const sale = saleResult.rows[0];

    const { processedItems, subtotal, itemDiscountTotal, taxTotal, costTotal } =
      await processCartItems(client, newItems, canOverridePrice);

    await insertSaleItems(client, saleId, processedItems, cashierId);

    const newSubtotal = round2(parseFloat(sale.subtotal) + subtotal);
    const newItemDiscount = round2(parseFloat(sale.item_discount) + itemDiscountTotal);
    const newTax = round2(parseFloat(sale.tax_amount) + taxTotal);
    const newCost = round2(parseFloat(sale.cost_total) + costTotal);
    const newTotal = Math.max(0, round2(newSubtotal - newItemDiscount + newTax));
    const newProfit = round2(newTotal - newCost);

    // bill_discount stays untouched (still 0) — it's only ever set once, at
    // completeHeldSale time, same as a coupon.
    const updated = await client.query(
      `UPDATE sales SET
         subtotal = $1, item_discount = $2, discount_amount = $2,
         tax_amount = $3, cost_total = $4, total_amount = $5, profit = $6, updated_at = NOW()
       WHERE id = $7 RETURNING *`,
      [newSubtotal, newItemDiscount, newTax, newCost, newTotal, newProfit, saleId]
    );
    return updated.rows[0];
  });
};

// Returns every sale_item on this held order that hasn't been sent to the
// kitchen yet (kot_sent_at IS NULL), grouped by station, then stamps them
// sent — a second call right after only ever returns items added since.
export const sendToKitchen = async (
  saleId: number
): Promise<{ sale: Sale; items: Array<Record<string, unknown>> }> => {
  return transaction(async (client: PoolClient) => {
    const saleResult = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND status = 'held' FOR UPDATE`,
      [saleId]
    );
    if (saleResult.rows.length === 0) throw createError('Held order not found', 404);

    const itemsResult = await client.query(
      `SELECT si.*, ks.id as station_id, ks.name as station_name
       FROM sale_items si
       LEFT JOIN products p ON si.product_id = p.id
       LEFT JOIN kitchen_stations ks ON p.station_id = ks.id
       WHERE si.sale_id = $1 AND si.kot_sent_at IS NULL`,
      [saleId]
    );

    if (itemsResult.rows.length === 0) {
      return { sale: saleResult.rows[0], items: [] };
    }

    await client.query(
      `UPDATE sale_items SET kot_sent_at = NOW() WHERE sale_id = $1 AND kot_sent_at IS NULL`,
      [saleId]
    );
    const updatedSale = await client.query(
      `UPDATE sales SET kot_printed_at = NOW() WHERE id = $1 RETURNING *`,
      [saleId]
    );

    return { sale: updatedSale.rows[0], items: itemsResult.rows };
  });
};

export const completeHeldSale = async (
  saleId: number,
  data: CompleteHeldSalePayload
): Promise<Sale> => {
  return transaction(async (client: PoolClient) => {
    const saleResult = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND status = 'held' FOR UPDATE`,
      [saleId]
    );
    if (saleResult.rows.length === 0) throw createError('Held order not found', 404);
    const sale = saleResult.rows[0];

    let customer: any = null;
    if (data.payment_method === 'credit') {
      const settingsResult = await client.query('SELECT plan_key, custom_features FROM settings WHERE id = 1');
      const planKey = settingsResult.rows[0]?.plan_key || DEFAULT_PLAN_KEY;
      const customFeatures = settingsResult.rows[0]?.custom_features ?? null;
      if (!planIncludes(planKey, 'customers', customFeatures)) {
        throw createError('Credit sales require the Customers feature, which isn\'t included in your current plan.', 403);
      }
      const customerId = data.customer_id ?? sale.customer_id;
      if (!customerId) throw createError('Select a customer for credit (pay later) sales', 400);
      const customerResult = await client.query(
        'SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
        [customerId]
      );
      if (customerResult.rows.length === 0) throw createError('Customer not found', 404);
      customer = customerResult.rows[0];
      if (!customer.is_active) throw createError('This customer account is inactive', 400);
    }

    const subtotal = parseFloat(sale.subtotal);
    const itemDiscountTotal = parseFloat(sale.item_discount);
    const taxTotal = parseFloat(sale.tax_amount);
    const costTotal = parseFloat(sale.cost_total);

    const maxBillDiscount = Math.max(0, round2(subtotal - itemDiscountTotal));
    const billDiscountAmount = Math.min(round2(data.bill_discount || 0), maxBillDiscount);

    let couponId: number | null = null;
    let couponDiscountAmount = 0;
    if (data.coupon_code) {
      const remaining = Math.max(0, round2(subtotal - itemDiscountTotal - billDiscountAmount));
      const customerId = data.customer_id ?? sale.customer_id ?? null;
      const redeemed = await redeemCoupon(client, data.coupon_code, remaining, customerId);
      couponId = redeemed.couponId;
      couponDiscountAmount = redeemed.discountAmount;
    }

    const discountTotal = round2(itemDiscountTotal + billDiscountAmount + couponDiscountAmount);
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

    const updated = await client.query(
      `UPDATE sales SET
         bill_discount = $1, discount_amount = $2, total_amount = $3, profit = $4,
         payment_method = $5, cash_tendered = $6, card_amount = $7, change_amount = $8,
         status = 'completed', customer_name = $9, customer_id = $10, notes = COALESCE($11, notes),
         coupon_id = $12, coupon_discount = $13, is_vat_invoice = $14, updated_at = NOW()
       WHERE id = $15 RETURNING *`,
      [
        billDiscountAmount, discountTotal, totalAmount, profit,
        data.payment_method, data.cash_tendered || 0, data.card_amount || 0, changeAmount,
        customer ? customer.name : (data.customer_name || sale.customer_name),
        customer ? customer.id : (data.customer_id ?? sale.customer_id),
        data.notes || null,
        couponId, couponDiscountAmount, data.is_vat_invoice === true, saleId,
      ]
    );
    const completedSale = updated.rows[0];

    if (customer) {
      await client.query(
        'UPDATE customers SET current_balance = current_balance + $1, updated_at = NOW() WHERE id = $2',
        [totalAmount, customer.id]
      );
    }

    // Deferred from hold time — a held order never touched shift totals
    // until it's actually paid for.
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
        sale.shift_id,
      ]
    );

    if (completedSale.table_id) {
      await setTableStatus(client, completedSale.table_id, 'available');
    }

    return completedSale;
  });
};

export const cancelHeldSale = async (saleId: number, reason: string, userId: number): Promise<Sale> => {
  return transaction(async (client: PoolClient) => {
    const saleResult = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND status = 'held' FOR UPDATE`,
      [saleId]
    );
    if (saleResult.rows.length === 0) throw createError('Held order not found', 404);
    const sale = saleResult.rows[0];

    // Restore stock for each item — a held order was never counted in shift
    // totals or a customer's balance, so unlike voidSale there's nothing to
    // reverse there, only the stock deduction made when it was created.
    const items = await client.query('SELECT * FROM sale_items WHERE sale_id = $1', [saleId]);
    for (const item of items.rows) {
      const stockResult = await client.query(
        'SELECT current_stock, costing_method FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );
      const balanceBefore = parseFloat(stockResult.rows[0].current_stock);
      const balanceAfter = round3(balanceBefore + parseFloat(item.quantity));

      await client.query(
        'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2',
        [balanceAfter, item.product_id]
      );

      if (stockResult.rows[0].costing_method === 'fifo') {
        await addBatch(client, {
          productId: item.product_id,
          quantity: parseFloat(item.quantity),
          unitCost: parseFloat(item.cost_price),
        });
      }

      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, balance_before, balance_after, reference_type, reference_id, created_by)
         VALUES ($1,'return_in',$2,$3,$4,'sale_void',$5,$6)`,
        [item.product_id, item.quantity, balanceBefore, balanceAfter, saleId, userId]
      );
    }

    const updated = await client.query(
      `UPDATE sales SET status = 'voided', void_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, saleId]
    );

    if (sale.table_id) {
      await setTableStatus(client, sale.table_id, 'available');
    }

    return updated.rows[0];
  });
};

export const getSales = async (params: {
  page?: number;
  limit?: number;
  date_from?: string;
  date_to?: string;
  cashier_id?: number;
  shift_id?: number;
  status?: string;
  sale_number?: string;
  table_id?: number;
  order_type?: string;
}) => {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const values: unknown[] = [];
  let i = 1;

  if (params.date_from) {
    conditions.push(`s.created_at >= $${i++}`);
    values.push(params.date_from);
  }
  if (params.date_to) {
    conditions.push(`s.created_at <= $${i++}`);
    values.push(params.date_to + ' 23:59:59');
  }
  if (params.cashier_id) {
    conditions.push(`s.cashier_id = $${i++}`);
    values.push(params.cashier_id);
  }
  if (params.shift_id) {
    conditions.push(`s.shift_id = $${i++}`);
    values.push(params.shift_id);
  }
  if (params.status) {
    conditions.push(`s.status = $${i++}`);
    values.push(params.status);
  }
  if (params.sale_number) {
    conditions.push(`s.sale_number ILIKE $${i++}`);
    values.push(`%${params.sale_number}%`);
  }
  if (params.table_id) {
    conditions.push(`s.table_id = $${i++}`);
    values.push(params.table_id);
  }
  if (params.order_type) {
    conditions.push(`s.order_type = $${i++}`);
    values.push(params.order_type);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query(`SELECT COUNT(*) FROM sales s ${where}`, values);
  const dataResult = await query(
    `SELECT s.*, u.name as cashier_name
     FROM sales s
     JOIN users u ON s.cashier_id = u.id
     ${where}
     ORDER BY s.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...values, limit, offset]
  );

  const total = parseInt(countResult.rows[0].count);
  return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getSaleById = async (id: number): Promise<Sale> => {
  const saleResult = await query(
    `SELECT s.*, u.name as cashier_name
     FROM sales s JOIN users u ON s.cashier_id = u.id
     WHERE s.id = $1`,
    [id]
  );
  if (saleResult.rows.length === 0) throw createError('Sale not found', 404);

  const itemsResult = await query(
    `SELECT si.*, COALESCE(ret.already_returned, 0) AS already_returned
     FROM sale_items si
     LEFT JOIN (
       SELECT sri.sale_item_id, SUM(sri.quantity) AS already_returned
       FROM sale_return_items sri
       JOIN sale_returns sr ON sri.return_id = sr.id
       WHERE sr.sale_id = $1
       GROUP BY sri.sale_item_id
     ) ret ON ret.sale_item_id = si.id
     WHERE si.sale_id = $1`,
    [id]
  );

  return { ...saleResult.rows[0], items: itemsResult.rows };
};

export const voidSale = async (id: number, reason: string, userId: number): Promise<Sale> => {
  return transaction(async (client: PoolClient) => {
    const saleResult = await client.query(
      'SELECT * FROM sales WHERE id = $1 AND status = $2',
      [id, 'completed']
    );
    if (saleResult.rows.length === 0) throw createError('Sale not found or cannot be voided', 404);

    const sale = saleResult.rows[0];

    // Restore stock for each item
    const items = await client.query('SELECT * FROM sale_items WHERE sale_id = $1', [id]);
    for (const item of items.rows) {
      const stockResult = await client.query(
        'SELECT current_stock, costing_method FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );
      const balanceBefore = parseFloat(stockResult.rows[0].current_stock);
      const balanceAfter = round3(balanceBefore + parseFloat(item.quantity));

      await client.query(
        'UPDATE products SET current_stock = $1, updated_at = NOW() WHERE id = $2',
        [balanceAfter, item.product_id]
      );

      // FIFO doesn't try to reverse into the exact original batch — restored
      // stock re-enters as a new batch, at the sale's recorded cost, dated now.
      if (stockResult.rows[0].costing_method === 'fifo') {
        await addBatch(client, {
          productId: item.product_id,
          quantity: parseFloat(item.quantity),
          unitCost: parseFloat(item.cost_price),
        });
      }

      await client.query(
        `INSERT INTO stock_movements
           (product_id, movement_type, quantity, balance_before, balance_after, reference_type, reference_id, created_by)
         VALUES ($1,'return_in',$2,$3,$4,'sale_void',$5,$6)`,
        [item.product_id, item.quantity, balanceBefore, balanceAfter, id, userId]
      );
    }

    // Update shift totals (reverse) — mirror the increment logic in createSale
    const voidedCashPortion = (sale.payment_method === 'cash' || sale.payment_method === 'mixed')
      ? round2(parseFloat(sale.cash_tendered) - parseFloat(sale.change_amount))
      : 0;
    const voidedCardPortion = (sale.payment_method === 'card' || sale.payment_method === 'mixed')
      ? parseFloat(sale.card_amount)
      : 0;
    await client.query(
      `UPDATE shifts SET
         total_sales = total_sales - $1,
         total_cash_sales = total_cash_sales - $2,
         total_card_sales = total_card_sales - $3,
         total_transactions = total_transactions - 1
       WHERE id = $4`,
      [sale.total_amount, voidedCashPortion, voidedCardPortion, sale.shift_id]
    );

    // Reverse the customer's outstanding balance for a voided credit sale
    if (sale.payment_method === 'credit' && sale.customer_id) {
      await client.query(
        'UPDATE customers SET current_balance = current_balance - $1, updated_at = NOW() WHERE id = $2',
        [sale.total_amount, sale.customer_id]
      );
    }

    const updated = await client.query(
      `UPDATE sales SET status = 'voided', void_reason = $1, updated_at = NOW()
       WHERE id = $2 RETURNING *`,
      [reason, id]
    );

    return updated.rows[0];
  });
};

export const returnSaleItems = async (
  saleId: number,
  data: ReturnSaleItemsPayload,
  userId: number
): Promise<SaleReturn> => {
  return transaction(async (client: PoolClient) => {
    // Validate sale
    const saleResult = await client.query(
      `SELECT * FROM sales WHERE id = $1 AND status IN ('completed', 'refunded')`,
      [saleId]
    );
    if (saleResult.rows.length === 0) throw createError('Sale not found or cannot be refunded', 404);

    // Require open shift
    const shiftResult = await client.query(
      `SELECT id FROM shifts WHERE opened_by = $1 AND status = 'open' ORDER BY open_time DESC LIMIT 1`,
      [userId]
    );
    if (shiftResult.rows.length === 0) throw createError('No open shift. Open a shift before processing a return.', 400);
    const shiftId = shiftResult.rows[0].id;

    // Load original sale items
    const originalItemsResult = await client.query('SELECT * FROM sale_items WHERE sale_id = $1', [saleId]);
    const originalItems = originalItemsResult.rows;
    const originalItemMap = new Map(originalItems.map((i: any) => [i.id, i]));

    // Load already-returned quantities per sale_item_id
    const alreadyReturnedResult = await client.query(
      `SELECT sri.sale_item_id, SUM(sri.quantity) AS returned_qty
       FROM sale_return_items sri
       JOIN sale_returns sr ON sri.return_id = sr.id
       WHERE sr.sale_id = $1
       GROUP BY sri.sale_item_id`,
      [saleId]
    );
    const returnedQtyMap = new Map<number, number>(
      alreadyReturnedResult.rows.map((r: any) => [parseInt(r.sale_item_id), parseFloat(r.returned_qty)])
    );

    // Validate return quantities and build processed items
    let totalRefundAmount = 0;
    const processedItems: any[] = [];

    for (const returnItem of data.items) {
      const original = originalItemMap.get(returnItem.sale_item_id) as any;
      if (!original) throw createError(`Item ${returnItem.sale_item_id} does not belong to this sale`, 400);

      const alreadyReturned = returnedQtyMap.get(returnItem.sale_item_id) ?? 0;
      const remainingReturnable = round3(parseFloat(original.quantity) - alreadyReturned);

      if (returnItem.quantity <= 0) throw createError('Return quantity must be greater than 0', 400);
      if (returnItem.quantity > remainingReturnable) {
        throw createError(
          `Cannot return ${returnItem.quantity} of "${original.product_name}". Max returnable: ${remainingReturnable}`,
          400
        );
      }

      // Refund proportionally to what was actually charged for this line
      // (original.subtotal is already net of item_discount and inclusive of
      // tax) — not the gross unit_price, which would over-refund any line
      // that had a discount and under-refund any line that had tax.
      const originalQty = parseFloat(original.quantity) || 1;
      const perUnitCharged = round2(parseFloat(original.subtotal) / originalQty);
      const refundSubtotal = round2(perUnitCharged * returnItem.quantity);
      totalRefundAmount += refundSubtotal;

      processedItems.push({
        sale_item_id: returnItem.sale_item_id,
        product_id: original.product_id,
        product_name: original.product_name,
        quantity: returnItem.quantity,
        unit_price: parseFloat(original.unit_price),
        cost_price: parseFloat(original.cost_price),
        refund_subtotal: refundSubtotal,
      });
    }

    totalRefundAmount = round2(totalRefundAmount);

    // Insert sale_returns header
    const returnNumber = generateReturnNumber();
    const returnResult = await client.query(
      `INSERT INTO sale_returns (return_number, sale_id, shift_id, processed_by, return_reason, refund_method, total_refund_amount, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [returnNumber, saleId, shiftId, userId, data.return_reason || null, data.refund_method, totalRefundAmount, data.notes || null]
    );
    const returnRecord = returnResult.rows[0];

    // Process each item: insert return item, restore stock, recalculate avg_cost
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO sale_return_items (return_id, sale_item_id, product_id, product_name, quantity, unit_price, cost_price, refund_subtotal)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [returnRecord.id, item.sale_item_id, item.product_id, item.product_name, item.quantity, item.unit_price, item.cost_price, item.refund_subtotal]
      );

      const productResult = await client.query(
        'SELECT current_stock, avg_cost, costing_method FROM products WHERE id = $1 FOR UPDATE',
        [item.product_id]
      );
      const product = productResult.rows[0];
      const currentStock = parseFloat(product.current_stock);
      const currentAvgCost = parseFloat(product.avg_cost);
      const balanceBefore = currentStock;
      const balanceAfter = round3(currentStock + item.quantity);
      // Kept as a live blend for every product regardless of costing method —
      // same reference/fallback-cost role it plays for GRN receipts.
      const newAvgCost = calculateWeightedAvgCost(currentStock, currentAvgCost, item.quantity, item.cost_price);

      await client.query(
        'UPDATE products SET current_stock = $1, avg_cost = $2, updated_at = NOW() WHERE id = $3',
        [balanceAfter, newAvgCost, item.product_id]
      );

      // FIFO doesn't try to reverse into the exact original batch — restored
      // stock re-enters as a new batch, at the sale's recorded cost, dated now.
      if (product.costing_method === 'fifo') {
        await addBatch(client, {
          productId: item.product_id,
          quantity: item.quantity,
          unitCost: item.cost_price,
        });
      }

      await client.query(
        `INSERT INTO stock_movements (product_id, movement_type, quantity, balance_before, balance_after, unit_cost, reference_type, reference_id, created_by)
         VALUES ($1,'return_in',$2,$3,$4,$5,'sale_return',$6,$7)`,
        [item.product_id, item.quantity, balanceBefore, balanceAfter, item.cost_price, returnRecord.id, userId]
      );
    }

    // Determine new sale status — 'refunded' if all items fully returned
    const updatedReturnedResult = await client.query(
      `SELECT sri.sale_item_id, SUM(sri.quantity) AS total_returned
       FROM sale_return_items sri
       JOIN sale_returns sr ON sri.return_id = sr.id
       WHERE sr.sale_id = $1
       GROUP BY sri.sale_item_id`,
      [saleId]
    );
    const updatedReturnedMap = new Map<number, number>(
      updatedReturnedResult.rows.map((r: any) => [parseInt(r.sale_item_id), parseFloat(r.total_returned)])
    );
    const allFullyReturned = originalItems.every((oi: any) => {
      const totalReturned = updatedReturnedMap.get(oi.id) ?? 0;
      return round3(totalReturned) >= round3(parseFloat(oi.quantity));
    });

    await client.query(
      `UPDATE sales SET status = $1, updated_at = NOW() WHERE id = $2`,
      [allFullyReturned ? 'refunded' : 'completed', saleId]
    );

    // Deduct from shift totals — also reverse the cash/card portion matching how it was refunded
    const refundedCashPortion = data.refund_method === 'cash' ? totalRefundAmount : 0;
    const refundedCardPortion = data.refund_method === 'card' ? totalRefundAmount : 0;
    await client.query(
      `UPDATE shifts SET
         total_sales = total_sales - $1,
         total_cash_sales = total_cash_sales - $2,
         total_card_sales = total_card_sales - $3
       WHERE id = $4`,
      [totalRefundAmount, refundedCashPortion, refundedCardPortion, shiftId]
    );

    // Returning items from a credit sale reduces what the customer owes
    const originalSale = saleResult.rows[0];
    if (originalSale.payment_method === 'credit' && originalSale.customer_id) {
      await client.query(
        'UPDATE customers SET current_balance = current_balance - $1, updated_at = NOW() WHERE id = $2',
        [totalRefundAmount, originalSale.customer_id]
      );
    }

    return { ...returnRecord, items: processedItems };
  });
};
