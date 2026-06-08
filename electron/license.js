'use strict';
/**
 * License verification module for the RetailPOS Electron app.
 *
 * ⚠️  IMPORTANT — Before building:
 *     1. Run `npm run setup` inside license-server/ to generate your Ed25519 key pair.
 *     2. Copy the PUBLIC KEY PEM (from keys/public.pem) and paste it below as PUBLIC_KEY.
 *     3. Add the PRIVATE KEY to your license server's .env file.
 *
 * The PUBLIC KEY is embedded here so the app can verify activation tokens OFFLINE.
 * It cannot be used to forge tokens — only the server's private key can sign.
 */

const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  PASTE YOUR PUBLIC KEY HERE (from license-server/keys/public.pem)
// ─────────────────────────────────────────────────────────────────────────────
const PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEA1EWBd74XG5pCB4TAz1Ck2dqYtdxIquJNOGWvKdPwaSs=
-----END PUBLIC KEY-----`;
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_FILE = 'activation.token';

/**
 * Returns a stable SHA-256 fingerprint of this machine.
 * Uses hostname + first non-internal MAC address + platform.
 */
function getMachineFingerprint() {
  const hostname = os.hostname();
  const platform = os.platform();

  let mac = '';
  const nets = os.networkInterfaces();
  outer: for (const name of Object.keys(nets)) {
    for (const iface of nets[name] || []) {
      if (!iface.internal && iface.mac && iface.mac !== '00:00:00:00:00:00') {
        mac = iface.mac;
        break outer;
      }
    }
  }

  return crypto
    .createHash('sha256')
    .update(`${hostname}|${mac}|${platform}`)
    .digest('hex');
}

/**
 * Path to the stored activation token in user data directory.
 */
function getTokenPath(userDataDir) {
  return path.join(userDataDir, TOKEN_FILE);
}

/**
 * Load and verify the stored activation token.
 * Returns the parsed payload if valid for this machine, null otherwise.
 *
 * @param {string} userDataDir - Electron app.getPath('userData')
 */
function checkLicense(userDataDir) {
  const tokenPath = getTokenPath(userDataDir);
  if (!fs.existsSync(tokenPath)) return null;

  try {
    const token = fs.readFileSync(tokenPath, 'utf8').trim();
    const payload = verifyToken(token);
    if (!payload) return null;

    const currentFp = getMachineFingerprint();
    if (payload.fp !== currentFp) {
      console.warn('[License] Fingerprint mismatch — token is for a different machine');
      return null;
    }

    return payload;
  } catch (err) {
    console.error('[License] Error reading token:', err.message);
    return null;
  }
}

/**
 * Verify an activation token's Ed25519 signature.
 * Returns the parsed payload if valid, null if invalid.
 *
 * Token format: base64url(JSON payload) . base64url(signature)
 */
function verifyToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, sigB64] = parts;

    if (PUBLIC_KEY_PEM.includes('REPLACE_WITH_YOUR')) {
      throw new Error('Public key has not been configured. Please embed your Ed25519 public key in electron/license.js.');
    }

    const publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);
    const signature = Buffer.from(sigB64, 'base64url');
    const valid = crypto.verify(null, Buffer.from(payloadB64), publicKey, signature);

    if (!valid) return null;
    return JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch (err) {
    console.error('[License] Token verification error:', err.message);
    return null;
  }
}

/**
 * Attempt to activate a license key online.
 *
 * @param {string} licenseKey    - The key entered by the user (e.g. RPOS-XXXX-XXXX-XXXX-XXXX)
 * @param {string} serverUrl     - The license server URL (e.g. https://license.example.com)
 * @param {string} userDataDir   - Electron app.getPath('userData')
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function activateLicense(licenseKey, serverUrl, userDataDir) {
  return new Promise((resolve) => {
    const fingerprint = getMachineFingerprint();
    const machineName = os.hostname();

    const body = JSON.stringify({
      license_key: licenseKey.trim().toUpperCase(),
      machine_fingerprint: fingerprint,
      machine_name: machineName,
    });

    const url = new URL('/api/verify', serverUrl.trim());
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      timeout: 15000,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.success && parsed.token) {
            // Verify the token locally before saving
            const payload = verifyToken(parsed.token);
            if (!payload) {
              resolve({ success: false, error: 'Server returned an invalid token. Key pair mismatch?' });
              return;
            }
            if (payload.fp !== fingerprint) {
              resolve({ success: false, error: 'Token fingerprint mismatch' });
              return;
            }
            // Save the token
            fs.mkdirSync(userDataDir, { recursive: true });
            fs.writeFileSync(getTokenPath(userDataDir), parsed.token, 'utf8');
            resolve({ success: true });
          } else {
            resolve({ success: false, error: parsed.error || 'Activation failed' });
          }
        } catch {
          resolve({ success: false, error: 'Invalid response from license server' });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: 'Connection timed out. Check your internet connection and server URL.' });
    });

    req.on('error', (err) => {
      resolve({ success: false, error: `Cannot reach license server: ${err.message}` });
    });

    req.write(body);
    req.end();
  });
}

module.exports = { checkLicense, activateLicense, getMachineFingerprint, verifyToken };
