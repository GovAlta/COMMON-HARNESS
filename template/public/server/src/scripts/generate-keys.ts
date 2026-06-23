/**
 * Generate RSA-2048 key pairs for RS256 JWT signing.
 *
 * Usage:
 *   npx tsx src/scripts/generate-keys.ts           # Generate dev keys in server/keys/
 *   npx tsx src/scripts/generate-keys.ts --env      # Output as .env format for Azure Key Vault
 *   npx tsx src/scripts/generate-keys.ts --check    # Verify existing keys are valid
 *
 * Key management:
 *   Development: Keys stored as PEM files in server/keys/ (gitignored)
 *   Production:  Keys stored in Azure Key Vault, injected as env vars:
 *                JWT_PRIVATE_KEY, JWT_PUBLIC_KEY,
 *                JWT_REFRESH_PRIVATE_KEY, JWT_REFRESH_PUBLIC_KEY
 *
 * To upload to Azure Key Vault:
 *   az keyvault secret set --vault-name <vault> --name jwt-private-key --file server/keys/jwt-private.pem
 *   az keyvault secret set --vault-name <vault> --name jwt-public-key --file server/keys/jwt-public.pem
 *   az keyvault secret set --vault-name <vault> --name jwt-refresh-private-key --file server/keys/jwt-refresh-private.pem
 *   az keyvault secret set --vault-name <vault> --name jwt-refresh-public-key --file server/keys/jwt-refresh-public.pem
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const KEYS_DIR = path.resolve(__dirname, '..', '..', 'keys');

const KEY_PAIRS = [
  { name: 'Access Token', privateFile: 'jwt-private.pem', publicFile: 'jwt-public.pem' },
  { name: 'Refresh Token', privateFile: 'jwt-refresh-private.pem', publicFile: 'jwt-refresh-public.pem' },
];

function generateKeyPair(): { privateKey: string; publicKey: string } {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privateKey, publicKey };
}

function generateToFiles(): void {
  if (!fs.existsSync(KEYS_DIR)) {
    fs.mkdirSync(KEYS_DIR, { recursive: true });
  }

  for (const pair of KEY_PAIRS) {
    const existing = fs.existsSync(path.join(KEYS_DIR, pair.privateFile));
    if (existing) {
      console.log(`  [skip] ${pair.name} keys already exist. Delete server/keys/ to regenerate.`);
      continue;
    }

    const { privateKey, publicKey } = generateKeyPair();
    fs.writeFileSync(path.join(KEYS_DIR, pair.privateFile), privateKey, { mode: 0o600 });
    fs.writeFileSync(path.join(KEYS_DIR, pair.publicFile), publicKey, { mode: 0o644 });
    console.log(`  [created] ${pair.name}: ${pair.privateFile}, ${pair.publicFile}`);
  }

  console.log(`\nKeys stored in: ${KEYS_DIR}`);
  console.log('These files are gitignored. Do not commit them.');
}

function generateToEnv(): void {
  console.log('# Paste these into Azure Key Vault or your production .env');
  console.log('# Each value is a base64-encoded PEM string.\n');

  for (const pair of KEY_PAIRS) {
    const { privateKey, publicKey } = generateKeyPair();
    const envPrivate = pair.privateFile.replace('.pem', '').replace(/-/g, '_').toUpperCase();
    const envPublic = pair.publicFile.replace('.pem', '').replace(/-/g, '_').toUpperCase();

    // For env vars, encode the PEM as a single-line base64 string
    // The app's loadKey() will need to decode this, OR you can store the raw PEM
    // Azure Key Vault supports multiline secrets natively
    console.log(`# ${pair.name}`);
    console.log(`${envPrivate}="${privateKey.replace(/\n/g, '\\n')}"`);
    console.log(`${envPublic}="${publicKey.replace(/\n/g, '\\n')}"\n`);
  }
}

function checkKeys(): void {
  let allValid = true;

  for (const pair of KEY_PAIRS) {
    const privatePath = path.join(KEYS_DIR, pair.privateFile);
    const publicPath = path.join(KEYS_DIR, pair.publicFile);

    if (!fs.existsSync(privatePath) || !fs.existsSync(publicPath)) {
      console.log(`  [missing] ${pair.name}: run generate-keys to create`);
      allValid = false;
      continue;
    }

    try {
      const privateKey = fs.readFileSync(privatePath, 'utf-8');
      const publicKey = fs.readFileSync(publicPath, 'utf-8');

      // Test sign + verify roundtrip
      const testPayload = { test: true, ts: Date.now() };
      const jwt = require('jsonwebtoken');
      const token = jwt.sign(testPayload, privateKey, { algorithm: 'RS256' });
      const decoded = jwt.verify(token, publicKey, { algorithms: ['RS256'] });

      if (decoded.test === true) {
        console.log(`  [valid]  ${pair.name}: sign + verify OK (RSA-2048)`);
      }
    } catch (err) {
      console.log(`  [error]  ${pair.name}: ${(err as Error).message}`);
      allValid = false;
    }
  }

  if (allValid) {
    console.log('\nAll key pairs are valid and working.');
  } else {
    console.log('\nSome keys are missing or invalid. Run: npx tsx src/scripts/generate-keys.ts');
    process.exit(1);
  }
}

// CLI
const arg = process.argv[2];

console.log('RSA-2048 Key Pair Generator for RS256 JWT Signing\n');

if (arg === '--env') {
  generateToEnv();
} else if (arg === '--check') {
  checkKeys();
} else {
  generateToFiles();
}
