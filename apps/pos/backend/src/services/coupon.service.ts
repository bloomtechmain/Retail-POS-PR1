import { PoolClient } from 'pg';
import { query } from '../config/database';
import { createError } from '../middleware/error';
import { Coupon } from '../types';
import { round2 } from '../utils/helpers';

export const getCoupons = async (): Promise<Coupon[]> => {
  const result = await query('SELECT * FROM coupons ORDER BY created_at DESC', []);
  return result.rows;
};

const validate = (data: Partial<Coupon>) => {
  if (!data.code?.trim()) throw createError('Coupon code is required', 400);
  if (data.type !== 'percent' && data.type !== 'fixed') {
    throw createError('Coupon type must be "percent" or "fixed"', 400);
  }
  const value = Number(data.discount_value);
  if (!(value > 0)) throw createError('Discount value must be greater than zero', 400);
  if (data.type === 'percent' && value > 100) {
    throw createError('Percent discount cannot exceed 100', 400);
  }
};

export const createCoupon = async (data: Partial<Coupon>): Promise<Coupon> => {
  validate(data);
  const result = await query(
    `INSERT INTO coupons (
       code, type, discount_value, min_purchase_amount, max_uses,
       max_uses_per_customer, start_date, end_date, is_active
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [
      data.code!.trim().toUpperCase(),
      data.type,
      data.discount_value,
      data.min_purchase_amount || null,
      data.max_uses || null,
      data.max_uses_per_customer || null,
      data.start_date || null,
      data.end_date || null,
      data.is_active !== false,
    ]
  );
  return result.rows[0];
};

export const updateCoupon = async (id: number, data: Partial<Coupon>): Promise<Coupon> => {
  validate(data);
  const result = await query(
    `UPDATE coupons SET
       code = $1, type = $2, discount_value = $3, min_purchase_amount = $4, max_uses = $5,
       max_uses_per_customer = $6, start_date = $7, end_date = $8, is_active = $9, updated_at = NOW()
     WHERE id = $10 RETURNING *`,
    [
      data.code!.trim().toUpperCase(),
      data.type,
      data.discount_value,
      data.min_purchase_amount || null,
      data.max_uses || null,
      data.max_uses_per_customer || null,
      data.start_date || null,
      data.end_date || null,
      data.is_active !== false,
      id,
    ]
  );
  if (result.rows.length === 0) throw createError('Coupon not found', 404);
  return result.rows[0];
};

export const deleteCoupon = async (id: number): Promise<void> => {
  // Hard delete is safe — sales.coupon_id is a soft, nullable reference, so
  // a past sale's own coupon_discount amount (already recorded on the sale
  // row) is unaffected by removing the coupon from the registry.
  const result = await query('DELETE FROM coupons WHERE id = $1', [id]);
  if (result.rowCount === 0) throw createError('Coupon not found', 404);
};

const computeDiscount = (coupon: Coupon, baseAmount: number): number => {
  const raw = coupon.type === 'percent'
    ? (baseAmount * Number(coupon.discount_value)) / 100
    : Number(coupon.discount_value);
  // A coupon can never discount more than what's actually left to discount —
  // same clamping discipline as bill_discount in sales.service.ts.
  return round2(Math.max(0, Math.min(raw, baseAmount)));
};

const checkEligibility = (coupon: Coupon, baseAmount: number) => {
  if (!coupon.is_active) throw createError('This coupon is no longer active', 400);
  const today = new Date().toISOString().slice(0, 10);
  if (coupon.start_date && today < coupon.start_date) {
    throw createError('This coupon is not active yet', 400);
  }
  if (coupon.end_date && today > coupon.end_date) {
    throw createError('This coupon has expired', 400);
  }
  if (coupon.max_uses != null && coupon.uses_count >= coupon.max_uses) {
    throw createError('This coupon has reached its usage limit', 400);
  }
  if (coupon.min_purchase_amount != null && baseAmount < Number(coupon.min_purchase_amount)) {
    throw createError(`This coupon requires a minimum purchase of ${coupon.min_purchase_amount}`, 400);
  }
};

// Read-only preview for the checkout UI — never mutates uses_count. The
// actual redemption (and the only place a discount amount is trusted) is
// redeemCoupon below, called inside the sale's own transaction.
export const previewCoupon = async (
  code: string,
  baseAmount: number
): Promise<{ coupon_id: number; discount_amount: number }> => {
  if (!code?.trim()) throw createError('Enter a coupon code', 400);
  const result = await query('SELECT * FROM coupons WHERE UPPER(code) = UPPER($1)', [code.trim()]);
  if (result.rows.length === 0) throw createError('Coupon not found', 404);
  const coupon: Coupon = result.rows[0];
  checkEligibility(coupon, baseAmount);
  return { coupon_id: coupon.id, discount_amount: computeDiscount(coupon, baseAmount) };
};

// Called inside createSale's transaction, under the same client/lock
// discipline as the rest of the sale. Locks the coupon row so two
// simultaneous sales can't both slip in under a `max_uses` cap, validates
// again from scratch (never trusts the frontend's preview amount), checks
// the per-customer cap against actual past sales, and increments
// uses_count as part of the same atomic write as the sale itself.
export const redeemCoupon = async (
  client: PoolClient,
  code: string,
  baseAmount: number,
  customerId: number | null
): Promise<{ couponId: number; discountAmount: number }> => {
  const result = await client.query('SELECT * FROM coupons WHERE UPPER(code) = UPPER($1) FOR UPDATE', [code.trim()]);
  if (result.rows.length === 0) throw createError('Coupon not found', 404);
  const coupon: Coupon = result.rows[0];
  checkEligibility(coupon, baseAmount);

  if (coupon.max_uses_per_customer != null) {
    if (!customerId) {
      throw createError('This coupon is limited per customer — select a customer to use it', 400);
    }
    const usedResult = await client.query(
      `SELECT COUNT(*) FROM sales WHERE coupon_id = $1 AND customer_id = $2 AND status IN ('completed','refunded')`,
      [coupon.id, customerId]
    );
    if (parseInt(usedResult.rows[0].count) >= coupon.max_uses_per_customer) {
      throw createError('You have already used this coupon the maximum number of times', 400);
    }
  }

  const discountAmount = computeDiscount(coupon, baseAmount);
  await client.query('UPDATE coupons SET uses_count = uses_count + 1, updated_at = NOW() WHERE id = $1', [coupon.id]);
  return { couponId: coupon.id, discountAmount };
};
