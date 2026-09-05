const test = require('node:test');
const assert = require('node:assert');
const { evaluateRangeStatus } = require('../dist/index.js');

test('Clinical Range Evaluator - Pure Deterministic Arithmetic', async (t) => {
  await t.test('returns not_provided_in_source when value or bounds are missing', () => {
    assert.strictEqual(evaluateRangeStatus(null, 10, 20), 'not_provided_in_source');
    assert.strictEqual(evaluateRangeStatus(undefined, 10, 20), 'not_provided_in_source');
    assert.strictEqual(evaluateRangeStatus(15, null, null), 'not_provided_in_source');
  });

  await t.test('correctly evaluates low status', () => {
    assert.strictEqual(evaluateRangeStatus(9.9, 10, 20), 'low');
    assert.strictEqual(evaluateRangeStatus(8.5, 10, 20), 'low');
  });

  await t.test('correctly evaluates critical_low at exactly 20% boundary and just past it', () => {
    // refLow = 10, 20% below is 8.0
    // Exactly at 20% boundary: not more than 20% below -> low
    assert.strictEqual(evaluateRangeStatus(8.0, 10, 20), 'low');
    // Just past the 20% boundary (more than 20% below) -> critical_low
    assert.strictEqual(evaluateRangeStatus(7.99, 10, 20), 'critical_low');
    assert.strictEqual(evaluateRangeStatus(5.0, 10, 20), 'critical_low');
  });

  await t.test('correctly evaluates high status', () => {
    assert.strictEqual(evaluateRangeStatus(20.1, 10, 20), 'high');
    assert.strictEqual(evaluateRangeStatus(22.0, 10, 20), 'high');
    assert.strictEqual(evaluateRangeStatus(151, null, 150), 'high');
  });

  await t.test('correctly evaluates critical_high at exactly 20% boundary and just past it', () => {
    // refHigh = 20, 20% above is 24.0
    // Exactly at 20% boundary: not more than 20% above -> high
    assert.strictEqual(evaluateRangeStatus(24.0, 10, 20), 'high');
    // Just past the 20% boundary (more than 20% above) -> critical_high
    assert.strictEqual(evaluateRangeStatus(24.01, 10, 20), 'critical_high');
    assert.strictEqual(evaluateRangeStatus(30.0, 10, 20), 'critical_high');
  });

  await t.test('correctly evaluates normal status within bounds', () => {
    assert.strictEqual(evaluateRangeStatus(10, 10, 20), 'normal');
    assert.strictEqual(evaluateRangeStatus(15, 10, 20), 'normal');
    assert.strictEqual(evaluateRangeStatus(20, 10, 20), 'normal');
    assert.strictEqual(evaluateRangeStatus(149, null, 150), 'normal');
    assert.strictEqual(evaluateRangeStatus(61, 60, null), 'normal');
  });
});
