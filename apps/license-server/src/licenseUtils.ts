import crypto from 'crypto';

// Characters to use in license keys — no ambiguous chars (0, O, I, 1)
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUP_LENGTH = 8;
const GROUP_COUNT = 4;

/**
 * Generate a cryptographically random license key.
 * Format: RPOS-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX
 * Each X is from CHARSET (32 chars), giving ~40 bits entropy per group, 160 bits total.
 */
export function generateLicenseKey(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    let group = '';
    // Use crypto.randomInt for unbiased selection
    for (let i = 0; i < GROUP_LENGTH; i++) {
      group += CHARSET[crypto.randomInt(0, CHARSET.length)];
    }
    groups.push(group);
  }
  return `RPOS-${groups.join('-')}`;
}

/**
 * Validate that a license key matches the expected format.
 */
export function isValidKeyFormat(key: string): boolean {
  return /^RPOS-[A-Z2-9]{8}-[A-Z2-9]{8}-[A-Z2-9]{8}-[A-Z2-9]{8}$/.test(key);
}

/**
 * Load the Ed25519 private key from the environment variable (base64 encoded PEM).
 */
function getPrivateKey(): crypto.KeyObject {
  const b64 = process.env.ED25519_PRIVATE_KEY;
  if (!b64) throw new Error('ED25519_PRIVATE_KEY is not set in environment');
  const pem = Buffer.from(b64, 'base64').toString('utf8');
  return crypto.createPrivateKey(pem);
}

/**
 * Load the Ed25519 public key from the environment variable (base64 encoded PEM).
 */
export function getPublicKey(): crypto.KeyObject {
  const b64 = process.env.ED25519_PUBLIC_KEY;
  if (!b64) throw new Error('ED25519_PUBLIC_KEY is not set in environment');
  const pem = Buffer.from(b64, 'base64').toString('utf8');
  return crypto.createPublicKey(pem);
}

/**
 * Create a signed activation token for a successfully verified license.
 * The token is a base64url-encoded JSON payload + Ed25519 signature.
 *
 * Payload structure:
 * {
 *   lk: "RPOS-...",              // license key
 *   fp: "sha256hexhash",         // machine fingerprint
 *   iat: 1234567890,             // issued at (unix timestamp)
 * }
 *
 * Token format: base64url(payload) + "." + base64url(signature)
 */
export function createActivationToken(licenseKey: string, machineFingerprint: string): string {
  const payload = JSON.stringify({
    lk: licenseKey,
    fp: machineFingerprint,
    iat: Math.floor(Date.now() / 1000),
  });

  const payloadB64 = Buffer.from(payload).toString('base64url');
  const privateKey = getPrivateKey();

  const signature = crypto.sign(null, Buffer.from(payloadB64), privateKey);
  const sigB64 = signature.toString('base64url');

  return `${payloadB64}.${sigB64}`;
}

/**
 * Verify an activation token using the public key.
 * Returns the parsed payload if valid, throws if invalid.
 */
export function verifyActivationToken(token: string): { lk: string; fp: string; iat: number } {
  const parts = token.split('.');
  if (parts.length !== 2) throw new Error('Invalid token format');

  const [payloadB64, sigB64] = parts;
  const publicKey = getPublicKey();
  const signature = Buffer.from(sigB64, 'base64url');

  const valid = crypto.verify(null, Buffer.from(payloadB64), publicKey, signature);
  if (!valid) throw new Error('Token signature verification failed');

  return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
}
