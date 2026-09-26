const { test } = require('node:test');
const { execFileSync } = require('node:child_process');

test('Firebase auth and JWKS verification work without native require(ESM)', () => {
  execFileSync(process.execPath, ['--no-experimental-require-module', '-e', `
    const assert = require('node:assert/strict');
    const { generateKeyPairSync, sign, verify } = require('node:crypto');
    require('firebase-admin/auth');
    const { JwksClient } = require('jwks-rsa');
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
    const client = new JwksClient({
      jwksUri: 'https://unused.invalid/keys',
      fetcher: async () => ({ keys: [jwk] }),
    });
    (async () => {
      const key = await client.getSigningKey('test-key');
      const payload = Buffer.from('signed authentication payload');
      const signature = sign('sha256', payload, privateKey);
      assert.equal(verify('sha256', payload, key.getPublicKey(), signature), true);
      assert.equal(verify('sha256', Buffer.from('tampered'), key.getPublicKey(), signature), false);
    })().catch((error) => { console.error(error); process.exitCode = 1; });
  `], { stdio: 'pipe' });
});
