/**
 * Run this once to generate Ed25519 key pair:
 *   npm run setup
 *
 * Copy ED25519_PRIVATE_KEY and ED25519_PUBLIC_KEY into your .env file.
 * Embed the PUBLIC KEY into electron/license.js in the POS application.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

const privateB64 = Buffer.from(privateKey).toString('base64');
const publicB64 = Buffer.from(publicKey).toString('base64');

console.log('\n========== RetailPOS License Server Setup ==========\n');
console.log('Ed25519 key pair generated successfully.\n');
console.log('Add these to your .env file:\n');
console.log(`ED25519_PRIVATE_KEY=${privateB64}`);
console.log(`ED25519_PUBLIC_KEY=${publicB64}`);
console.log('\n-----------------------------------------------------');
console.log('Embed this PUBLIC KEY in electron/license.js:');
console.log('\nconst PUBLIC_KEY = `');
console.log(publicKey.trim());
console.log('`;\n');
console.log('=====================================================\n');

// Also write to a keys/ directory for convenience
const keysDir = path.join(__dirname, '..', 'keys');
fs.mkdirSync(keysDir, { recursive: true });
fs.writeFileSync(path.join(keysDir, 'private.pem'), privateKey);
fs.writeFileSync(path.join(keysDir, 'public.pem'), publicKey);
fs.writeFileSync(
  path.join(keysDir, 'env-values.txt'),
  `ED25519_PRIVATE_KEY=${privateB64}\nED25519_PUBLIC_KEY=${publicB64}\n`
);
console.log(`Keys also saved to keys/ directory (keep private.pem SECRET!)\n`);
