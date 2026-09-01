// In-memory "issued before this moment" cutoff per user, so a token minted
// before a password change stops working immediately instead of staying
// valid for its full remaining lifetime. Same tradeoff as rateLimiter.ts:
// resets on process restart, which is acceptable since tokens are capped at
// JWT_EXPIRES_IN (8h) anyway and each app runs as a single PM2 process.
const revokedBefore = new Map<number, number>();

export const markPasswordChanged = (userId: number): void => {
  revokedBefore.set(userId, Date.now());
};

// `issuedAtSec` is the JWT's own `iat` claim (seconds since epoch).
export const isTokenRevoked = (userId: number, issuedAtSec: number | undefined): boolean => {
  if (issuedAtSec === undefined) return false;
  const cutoff = revokedBefore.get(userId);
  if (!cutoff) return false;
  return issuedAtSec * 1000 < cutoff;
};
