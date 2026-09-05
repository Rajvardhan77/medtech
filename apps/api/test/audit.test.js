const test = require('node:test');
const assert = require('node:assert');
const { extractClientIp } = require('../dist/middleware/audit.js');

test('Audit Middleware - Client IP Extraction', async (t) => {
  await t.test('extracts single IP from x-forwarded-for header', () => {
    const mockReq = {
      headers: {
        'x-forwarded-for': '198.51.100.42',
      },
      socket: { remoteAddress: '127.0.0.1' },
    };

    const ip = extractClientIp(mockReq);
    assert.strictEqual(ip, '198.51.100.42');
  });

  await t.test('extracts first client IP from comma-separated proxy chain', () => {
    const mockReq = {
      headers: {
        'x-forwarded-for': '203.0.113.195, 70.41.3.18, 150.172.238.178',
      },
      socket: { remoteAddress: '10.0.0.1' },
    };

    const ip = extractClientIp(mockReq);
    assert.strictEqual(ip, '203.0.113.195');
  });

  await t.test('falls back to socket remoteAddress when header is not present', () => {
    const mockReq = {
      headers: {},
      socket: { remoteAddress: '192.168.1.105' },
    };

    const ip = extractClientIp(mockReq);
    assert.strictEqual(ip, '192.168.1.105');
  });

  await t.test('returns "unknown" when neither forwarded header nor socket remoteAddress is available', () => {
    const mockReq = {
      headers: {},
      socket: {},
    };

    const ip = extractClientIp(mockReq);
    assert.strictEqual(ip, 'unknown');
  });
});
