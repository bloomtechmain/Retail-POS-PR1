import { query, transaction } from '../config/database';
import { createError } from '../middleware/error';
import { Terminal } from '../types';
import { PLANS, DEFAULT_PLAN_KEY } from '../data/plans';
import { PoolClient } from 'pg';

// Called by a Terminal machine on startup, before any staff login exists —
// there is no JWT to authenticate this request with, so trust is purely
// "reachable on the same LAN as the Server," matching the plan's design
// (the Server is the single enforcement point; Terminals never talk to the
// public license-server at all). Idempotent by fingerprint: a Terminal
// that's already registered just refreshes last_seen_at and is always
// allowed back in, even if the plan was later downgraded — only a NEW
// fingerprint is checked against the seat cap.
export const registerTerminal = async (fingerprint: string, name: string | null): Promise<Terminal> => {
  if (!fingerprint || typeof fingerprint !== 'string') {
    throw createError('Missing machine fingerprint', 400);
  }

  return transaction(async (client: PoolClient) => {
    const settingsResult = await client.query('SELECT plan_key, custom_features FROM settings WHERE id = 1');
    const planKey = settingsResult.rows[0]?.plan_key || DEFAULT_PLAN_KEY;
    const customFeatures = settingsResult.rows[0]?.custom_features ?? null;
    const features = customFeatures ?? PLANS[planKey]?.features ?? [];
    if (!features.includes('multi_terminal')) {
      throw createError('Multi-terminal mode isn\'t included in this Server\'s current plan.', 403);
    }

    const existing = await client.query('SELECT * FROM terminals WHERE fingerprint = $1 FOR UPDATE', [fingerprint]);
    if (existing.rows.length > 0) {
      const updated = await client.query(
        'UPDATE terminals SET last_seen_at = NOW(), name = COALESCE($1, name) WHERE fingerprint = $2 RETURNING *',
        [name, fingerprint]
      );
      return updated.rows[0];
    }

    const maxTerminals = customFeatures != null
      ? null // an explicit custom-feature override has no matching seat-count concept — treat as unlimited
      : (PLANS[planKey]?.max_terminals ?? 0);
    if (maxTerminals != null) {
      const countResult = await client.query('SELECT COUNT(*) FROM terminals');
      if (parseInt(countResult.rows[0].count) >= maxTerminals) {
        throw createError(`This Server already has the maximum ${maxTerminals} terminal(s) for its plan.`, 403);
      }
    }

    const inserted = await client.query(
      'INSERT INTO terminals (fingerprint, name) VALUES ($1, $2) RETURNING *',
      [fingerprint, name]
    );
    return inserted.rows[0];
  });
};

export const getTerminals = async (): Promise<Terminal[]> => {
  const result = await query('SELECT * FROM terminals ORDER BY last_seen_at DESC', []);
  return result.rows;
};

export const removeTerminal = async (id: number): Promise<void> => {
  const result = await query('DELETE FROM terminals WHERE id = $1', [id]);
  if (result.rowCount === 0) throw createError('Terminal not found', 404);
};
