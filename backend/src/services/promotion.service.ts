import { query } from '../config/database';
import { createError } from '../middleware/error';
import { Promotion, CartItem } from '../types';
import { round2 } from '../utils/helpers';

export const getPromotions = async (activeOnly = false) => {
  const where = activeOnly
    ? `WHERE p.is_active = TRUE AND (p.start_date IS NULL OR p.start_date <= CURRENT_DATE)
         AND (p.end_date IS NULL OR p.end_date >= CURRENT_DATE)`
    : '';
  const result = await query(
    `SELECT p.*, c.name as category_name, pr.name as product_name
     FROM promotions p
     LEFT JOIN categories c ON p.category_id = c.id
     LEFT JOIN products pr ON p.product_id = pr.id
     ${where}
     ORDER BY p.priority DESC, p.created_at DESC`,
    []
  );
  return result.rows;
};

export const getActivePromotions = () => getPromotions(true);

export const createPromotion = async (data: Partial<Promotion>, userId: number): Promise<Promotion> => {
  const result = await query(
    `INSERT INTO promotions (
       name, description, type, discount_value, min_purchase_amount, min_purchase_qty,
       buy_quantity, get_quantity, get_product_id, applies_to, category_id, product_id,
       start_date, end_date, is_active, priority, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     RETURNING *`,
    [
      data.name, data.description || null, data.type,
      data.discount_value || null, data.min_purchase_amount || null, data.min_purchase_qty || null,
      data.buy_quantity || null, data.get_quantity || null, data.get_product_id || null,
      data.applies_to || 'all', data.category_id || null, data.product_id || null,
      data.start_date || null, data.end_date || null, data.is_active !== false,
      data.priority || 0, userId,
    ]
  );
  return result.rows[0];
};

export const updatePromotion = async (id: number, data: Partial<Promotion>): Promise<Promotion> => {
  const result = await query(
    `UPDATE promotions SET
       name=$1, description=$2, type=$3, discount_value=$4,
       min_purchase_amount=$5, min_purchase_qty=$6, buy_quantity=$7,
       get_quantity=$8, applies_to=$9, category_id=$10, product_id=$11,
       start_date=$12, end_date=$13, is_active=$14, priority=$15, updated_at=NOW()
     WHERE id=$16 RETURNING *`,
    [
      data.name, data.description || null, data.type, data.discount_value || null,
      data.min_purchase_amount || null, data.min_purchase_qty || null, data.buy_quantity || null,
      data.get_quantity || null, data.applies_to || 'all', data.category_id || null, data.product_id || null,
      data.start_date || null, data.end_date || null, data.is_active !== false, data.priority || 0, id,
    ]
  );
  if (result.rows.length === 0) throw createError('Promotion not found', 404);
  return result.rows[0];
};

export const deletePromotion = async (id: number): Promise<void> => {
  await query('DELETE FROM promotions WHERE id = $1', [id]);
};

// Apply active promotions to cart items
// If promotionId is provided, only that specific promotion is applied
export const applyPromotions = async (
  items: CartItem[],
  promotionId?: number
): Promise<{ items: CartItem[]; promotionsSummary: string[] }> => {
  let promos = await getActivePromotions();
  if (promotionId) {
    promos = promos.filter((p) => Number(p.id) === Number(promotionId));
  }
  const applied: string[] = [];
  const updatedItems = items.map((item) => ({ ...item }));

  // Fetch category_id for each product in the cart (needed for category-scoped promos)
  const productIds = items.map((i) => i.product_id);
  let productCategoryMap: Record<number, number | null> = {};
  if (productIds.length > 0) {
    const catResult = await query(
      'SELECT id, category_id FROM products WHERE id = ANY($1)',
      [productIds]
    );
    for (const row of catResult.rows) {
      productCategoryMap[Number(row.id)] = row.category_id ? Number(row.category_id) : null;
    }
  }

  const cartTotal = updatedItems.reduce((s, i) => s + Number(i.unit_price) * Number(i.quantity), 0);

  for (const promo of promos) {
    // Cast pg NUMERIC columns to JS numbers
    const discVal = Number(promo.discount_value || 0);
    const minAmt  = Number(promo.min_purchase_amount || 0);

    if (minAmt > 0 && cartTotal < minAmt) continue;

    if (promo.type === 'percentage' && discVal) {
      if (promo.applies_to === 'all') {
        for (const item of updatedItems) {
          const discount = round2((Number(item.unit_price) * discVal) / 100);
          item.item_discount = round2((Number(item.item_discount) || 0) + discount);
          item.promotion_id = promo.id;
        }
        applied.push(`${promo.name} (-${discVal}%)`);
      } else if (promo.applies_to === 'category' && promo.category_id) {
        const targets = updatedItems.filter(
          (i) => productCategoryMap[Number(i.product_id)] === Number(promo.category_id)
        );
        if (targets.length > 0) {
          for (const target of targets) {
            const discount = round2((Number(target.unit_price) * discVal) / 100);
            target.item_discount = round2((Number(target.item_discount) || 0) + discount);
            target.promotion_id = promo.id;
          }
          applied.push(`${promo.name} (-${discVal}% on ${promo.category_name})`);
        }
      } else if (promo.applies_to === 'product' && promo.product_id) {
        const target = updatedItems.find((i) => Number(i.product_id) === Number(promo.product_id));
        if (target) {
          const discount = round2((Number(target.unit_price) * discVal) / 100);
          target.item_discount = round2((Number(target.item_discount) || 0) + discount);
          target.promotion_id = promo.id;
          applied.push(`${promo.name} on ${target.product_name}`);
        }
      }
    } else if (promo.type === 'fixed_amount' && discVal) {
      if (promo.applies_to === 'all') {
        if (updatedItems.length > 0) {
          updatedItems[0].item_discount = round2((Number(updatedItems[0].item_discount) || 0) + discVal);
          updatedItems[0].promotion_id = promo.id;
          applied.push(`${promo.name}: -LKR ${discVal}`);
        }
      } else if (promo.applies_to === 'product' && promo.product_id) {
        const target = updatedItems.find((i) => Number(i.product_id) === Number(promo.product_id));
        if (target) {
          target.item_discount = round2((Number(target.item_discount) || 0) + discVal);
          target.promotion_id = promo.id;
          applied.push(`${promo.name}: -LKR ${discVal}`);
        }
      } else if (promo.applies_to === 'category' && promo.category_id) {
        const targets = updatedItems.filter(
          (i) => productCategoryMap[Number(i.product_id)] === Number(promo.category_id)
        );
        if (targets.length > 0) {
          for (const target of targets) {
            target.item_discount = round2((Number(target.item_discount) || 0) + discVal);
            target.promotion_id = promo.id;
          }
          applied.push(`${promo.name}: -LKR ${discVal} on ${promo.category_name}`);
        }
      }
    }
  }

  return { items: updatedItems, promotionsSummary: applied };
};
