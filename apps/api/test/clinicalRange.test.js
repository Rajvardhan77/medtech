const test = require('node:test');
const assert = require('node:assert');
const { parseReferenceRangeString, computeClinicalRangeStatus } = require('../dist/services/clinicalRangeService.js');

test('Clinical Range Service - String Parsing & Status', async (t) => {
  await t.test('parses hyphenated numeric ranges', () => {
    const range1 = parseReferenceRangeString('13.5 - 17.5');
    assert.strictEqual(range1.low, 13.5);
    assert.strictEqual(range1.high, 17.5);

    const range2 = parseReferenceRangeString('3.5 to 5.0');
    assert.strictEqual(range2.low, 3.5);
    assert.strictEqual(range2.high, 5.0);
  });

  await t.test('parses less-than upper bounds', () => {
    const range = parseReferenceRangeString('< 150 mg/dL');
    assert.strictEqual(range.low, null);
    assert.strictEqual(range.high, 150);
  });

  await t.test('parses greater-than lower bounds', () => {
    const range = parseReferenceRangeString('>= 60 mL/min');
    assert.strictEqual(range.low, 60);
    assert.strictEqual(range.high, null);
  });

  await t.test('computes clinical range status end-to-end', () => {
    const res1 = computeClinicalRangeStatus(12.0, null, null, '13.5 - 17.5');
    assert.strictEqual(res1.status, 'low');
    assert.strictEqual(res1.low, 13.5);
    assert.strictEqual(res1.high, 17.5);

    const res2 = computeClinicalRangeStatus(14.2, null, null, '13.5 - 17.5');
    assert.strictEqual(res2.status, 'normal');

    const res3 = computeClinicalRangeStatus(18.0, null, null, '13.5 - 17.5');
    assert.strictEqual(res3.status, 'high');
  });
});
