// In-memory "issued before this moment" cutoff per user, so a token minted
// before a password change stops working immediately instead of staying
// valid for its full remaining lifetime. Same tradeoff as rateLimiter.ts:
// resets on process restart, which is acceptable since tokens are capped at
// JWT_EXPIRES_IN (8h) anyway and each app runs as a single PM2 process.
//
// Stored in whole SECONDS, matching the JWT `iat` claim's own granularity
// (jsonwebtoken truncates to seconds) — not milliseconds. changePassword
// re-signs a fresh token in the same request that calls this, so that
// token's `iat` and this cutoff are computed within the same second the
// overwhelming majority of the time; comparing at millisecond precision
// against a second-truncated `iat` made the brand-new token look "issued
// before" its own revocation cutoff and get rejected immediately — the
// exact forced-logout bug this mechanism was supposed to prevent, not
// cause. Comparing in the same (second) unit throughout removes the race.
const revokedBeforeSec = new Map<number, number>();

export const markPasswordChanged = (userId: number): void => {
  revokedBeforeSec.set(userId, Math.floor(Date.now() / 1000));
};

// `issuedAtSec` is the JWT's own `iat` claim (seconds since epoch).
export const isTokenRevoked = (userId: number, issuedAtSec: number | undefined): boolean => {
  if (issuedAtSec === undefined) return false;
  const cutoffSec = revokedBeforeSec.get(userId);
  if (!cutoffSec) return false;
  return issuedAtSec < cutoffSec;
};
