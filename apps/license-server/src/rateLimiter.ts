// Lightweight in-memory throttle — no new dependency, single PM2 process.
// Applied to both the admin login and the public activation endpoint, since
// neither had any limit on repeated requests before this.
interface Entry {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
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

export const recordAttempt = (key: string): void => {
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
