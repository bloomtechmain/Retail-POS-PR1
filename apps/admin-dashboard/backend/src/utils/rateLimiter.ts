// Lightweight in-memory login throttle — no new dependency, and fine since
// this app runs as a single PM2 process (not clustered). Keyed by IP+email
// so one attacker can't lock out a real user's account.
interface Entry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const store = new Map<string, Entry>();

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
