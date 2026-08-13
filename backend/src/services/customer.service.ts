import { PoolClient } from 'pg';
import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { round2 } from '../utils/helpers';
import { Customer, CustomerPayment } from '../types';

export const getCustomers = async (params: {
  page?: number;
  limit?: number;
  search?: string;
  with_balance_only?: boolean;
}) => {
  const page = params.page || 1;
  const limit = params.limit || 20;
  const offset = (page - 1) * limit;

  const conditions: string[] = ['deleted_at IS NULL'];
  const values: unknown[] = [];
  let i = 1;

  if (params.search) {
    conditions.push(`(name ILIKE $${i} OR phone ILIKE $${i} OR email ILIKE $${i})`);
    values.push(`%${params.search}%`);
    i += 1;
  }
  if (params.with_balance_only) {
    conditions.push('current_balance > 0');
  }

  const where = `WHERE ${conditions.join(' AND ')}`;

  const countResult = await query(`SELECT COUNT(*) FROM customers ${where}`, values);
  const dataResult = await query(
    `SELECT * FROM customers ${where} ORDER BY name ASC LIMIT $${i} OFFSET $${i + 1}`,
    [...values, limit, offset]
  );

  const total = parseInt(countResult.rows[0].count);
  return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
};

export const getCustomerById = async (id: number): Promise<Customer> => {
  const result = await query('SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL', [id]);
  if (result.rows.length === 0) throw createError('Customer not found', 404);
  return result.rows[0];
};

export const createCustomer = async (data: {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  credit_limit?: number | null;
  notes?: string;
}): Promise<Customer> => {
  if (!data.name?.trim()) throw createError('Customer name is required', 400);

  const result = await query(
    `INSERT INTO customers (name, phone, email, address, credit_limit, notes)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [
      data.name.trim(),
      data.phone || null,
      data.email || null,
      data.address || null,
      data.credit_limit === undefined || data.credit_limit === null ? null : data.credit_limit,
      data.notes || null,
    ]
  );
  return result.rows[0];
};

export const updateCustomer = async (
  id: number,
  data: Partial<{
    name: string;
    phone: string;
    email: string;
    address: string;
    credit_limit: number | null;
    notes: string;
    is_active: boolean;
  }>
): Promise<Customer> => {
  const existing = await getCustomerById(id);

  const result = await query(
    `UPDATE customers SET
       name = $1, phone = $2, email = $3, address = $4,
       credit_limit = $5, notes = $6, is_active = $7, updated_at = NOW()
     WHERE id = $8 RETURNING *`,
    [
      data.name?.trim() || existing.name,
      data.phone ?? existing.phone,
      data.email ?? existing.email,
      data.address ?? existing.address,
      data.credit_limit === undefined ? existing.credit_limit : data.credit_limit,
      data.notes ?? existing.notes,
      data.is_active === undefined ? existing.is_active : data.is_active,
      id,
    ]
  );
  return result.rows[0];
};

export const deleteCustomer = async (id: number): Promise<void> => {
  const customer = await getCustomerById(id);
  if (round2(Number(customer.current_balance)) !== 0) {
    throw createError('Cannot delete a customer with an outstanding credit balance', 400);
  }
  await query('UPDATE customers SET deleted_at = NOW(), is_active = FALSE WHERE id = $1', [id]);
};

export const recordPayment = async (
  customerId: number,
  data: { amount: number; payment_method?: 'cash' | 'card'; notes?: string },
  userId: number
): Promise<CustomerPayment> => {
  return transaction(async (client: PoolClient) => {
    const customerResult = await client.query(
      'SELECT * FROM customers WHERE id = $1 AND deleted_at IS NULL FOR UPDATE',
      [customerId]
    );
    if (customerResult.rows.length === 0) throw createError('Customer not found', 404);
    const customer = customerResult.rows[0];

    const amount = round2(Number(data.amount));
    if (!amount || amount <= 0) throw createError('Payment amount must be greater than 0', 400);

    const currentBalance = round2(Number(customer.current_balance));
    if (amount > currentBalance) {
      throw createError(`Payment cannot exceed the outstanding balance of ${currentBalance.toFixed(2)}`, 400);
    }

    const paymentResult = await client.query(
      `INSERT INTO customer_payments (customer_id, amount, payment_method, notes, received_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [customerId, amount, data.payment_method || 'cash', data.notes || null, userId]
    );

    await client.query(
      'UPDATE customers SET current_balance = current_balance - $1, updated_at = NOW() WHERE id = $2',
      [amount, customerId]
    );

    return paymentResult.rows[0];
  });
};

export const getCustomerStatement = async (customerId: number) => {
  const customer = await getCustomerById(customerId);

  const salesResult = await query(
    `SELECT id, sale_number, total_amount, status, created_at
     FROM sales
     WHERE customer_id = $1 AND payment_method = 'credit' AND status IN ('completed', 'refunded')
     ORDER BY created_at ASC`,
    [customerId]
  );

  const paymentsResult = await query(
    `SELECT cp.id, cp.amount, cp.payment_method, cp.notes, cp.created_at, u.name as received_by_name
     FROM customer_payments cp
     LEFT JOIN users u ON cp.received_by = u.id
     WHERE cp.customer_id = $1
     ORDER BY cp.created_at ASC`,
    [customerId]
  );

  type LedgerEntry = {
    type: 'sale' | 'payment';
    id: number;
    reference: string;
    amount: number;
    created_at: Date;
  };

  const ledger: LedgerEntry[] = [
    ...salesResult.rows.map((s: any) => ({
      type: 'sale' as const,
      id: s.id,
      reference: s.sale_number,
      amount: round2(Number(s.total_amount)),
      created_at: s.created_at,
    })),
    ...paymentsResult.rows.map((p: any) => ({
      type: 'payment' as const,
      id: p.id,
      reference: p.notes || `Payment (${p.payment_method})${p.received_by_name ? ' — ' + p.received_by_name : ''}`,
      amount: -round2(Number(p.amount)),
      created_at: p.created_at,
    })),
  ].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  let runningBalance = 0;
  const entries = ledger.map((entry) => {
    runningBalance = round2(runningBalance + entry.amount);
    return { ...entry, balance: runningBalance };
  });

  return { customer, entries };
};
