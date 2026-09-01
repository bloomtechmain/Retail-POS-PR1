// Lightweight in-memory login throttle — no new dependency, and fine since
// each app runs as a single PM2 process (not clustered), so there's exactly
// one counter store to worry about. Keyed by IP+email so one attacker can't
// lock out a real user's account, and a distributed attacker still has to
// work through the per-IP limit for each address they use.
interface Entry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const store = new Map<string, Entry>();

// Returns seconds remaining if the key is currently locked out, or null if
// the attempt is allowed to proceed.
export const isRateLimited = (key: string): number | null => {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) return null;
  if (entry.count >= MAX_ATTEMPTS) {
    return Math.ceil((entry.resetAt - now) / 1000);
  }
  return null;
};

export const recordFailedAttempt = (key: string): void => {
  const now = Date.now();
  const entry = store.get(key);
  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
};

export const clearAttempts = (key: string): void => {
  store.delete(key);
};
