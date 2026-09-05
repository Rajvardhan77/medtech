const test = require('node:test');
const assert = require('node:assert');
const { encryptField, decryptField } = require('../dist/utils/crypto.js');

test('AES-256-GCM Field-Level Encryption', async (t) => {
  await t.test('encrypts and decrypts sensitive clinical text cleanly', () => {
    const original = 'Patient reports severe penicillin anaphylaxis occurring in 2019';
    const encrypted = encryptField(original);

    assert.ok(encrypted);
    assert.ok(encrypted.startsWith('enc:v1:'));
    assert.notStrictEqual(encrypted, original);

    const decrypted = decryptField(encrypted);
    assert.strictEqual(decrypted, original);
  });

  await t.test('handles null, undefined, and empty inputs gracefully', () => {
    assert.strictEqual(encryptField(null), null);
    assert.strictEqual(encryptField(undefined), null);
    assert.strictEqual(encryptField(''), null);

    assert.strictEqual(decryptField(null), null);
    assert.strictEqual(decryptField(undefined), null);
  });

  await t.test('gracefully falls back for legacy unencrypted plaintext', () => {
    const unencrypted = 'Mild seasonal rhinitis';
    const result = decryptField(unencrypted);
    assert.strictEqual(result, unencrypted);
  });
});
