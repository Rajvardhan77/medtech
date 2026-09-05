const test = require('node:test');
const assert = require('node:assert');
const { computeLongitudinalTrends } = require('../dist/services/trendService.js');

test('Longitudinal Trends Service', async (t) => {
  await t.test('computes "up" trend direction when values increase over time', () => {
    const tests = [
      {
        test_name: 'Hemoglobin A1c',
        unit: '%',
        numeric_value: 5.6,
        range_status: 'normal',
        observation_date: new Date('2025-01-10'),
      },
      {
        test_name: 'Hemoglobin A1c',
        unit: '%',
        numeric_value: 6.2,
        range_status: 'high',
        observation_date: new Date('2025-06-15'),
      },
    ];

    const trends = computeLongitudinalTrends(tests);
    assert.strictEqual(trends.length, 1);
    assert.strictEqual(trends[0].test_name, 'Hemoglobin A1c');
    assert.strictEqual(trends[0].direction, 'up');
    assert.strictEqual(trends[0].latest_value, 6.2);
    assert.strictEqual(trends[0].previous_value, 5.6);
    assert.strictEqual(trends[0].datapoints.length, 2);
  });

  await t.test('computes "down" trend direction when values decrease over time', () => {
    const tests = [
      {
        test_name: 'Total Cholesterol',
        unit: 'mg/dL',
        numeric_value: 240,
        range_status: 'high',
        observation_date: new Date('2025-01-01'),
      },
      {
        test_name: 'Total Cholesterol',
        unit: 'mg/dL',
        numeric_value: 195,
        range_status: 'normal',
        observation_date: new Date('2025-05-01'),
      },
    ];

    const trends = computeLongitudinalTrends(tests);
    assert.strictEqual(trends.length, 1);
    assert.strictEqual(trends[0].direction, 'down');
    assert.strictEqual(trends[0].latest_value, 195);
    assert.strictEqual(trends[0].previous_value, 240);
  });

  await t.test('computes "flat" trend direction when values are equal or for single datapoint', () => {
    const singleTest = [
      {
        test_name: 'TSH',
        unit: 'uIU/mL',
        numeric_value: 2.1,
        range_status: 'normal',
        observation_date: new Date('2025-03-01'),
      },
    ];

    const singleTrend = computeLongitudinalTrends(singleTest);
    assert.strictEqual(singleTrend.length, 1);
    assert.strictEqual(singleTrend[0].direction, 'flat');
    assert.strictEqual(singleTrend[0].previous_value, null);

    const equalTests = [
      {
        test_name: 'Sodium',
        unit: 'mEq/L',
        numeric_value: 140,
        range_status: 'normal',
        observation_date: new Date('2025-01-01'),
      },
      {
        test_name: 'Sodium',
        unit: 'mEq/L',
        numeric_value: 140,
        range_status: 'normal',
        observation_date: new Date('2025-04-01'),
      },
    ];

    const equalTrends = computeLongitudinalTrends(equalTests);
    assert.strictEqual(equalTrends.length, 1);
    assert.strictEqual(equalTrends[0].direction, 'flat');
    assert.strictEqual(equalTrends[0].latest_value, 140);
    assert.strictEqual(equalTrends[0].previous_value, 140);
  });

  await t.test('sorts disordered observations chronologically and groups by normalized test name', () => {
    const unordered = [
      {
        test_name: 'Platelet Count',
        unit: 'k/uL',
        numeric_value: 280,
        range_status: 'normal',
        observation_date: new Date('2025-08-01'),
      },
      {
        test_name: 'platelet count ',
        unit: 'k/uL',
        numeric_value: 220,
        range_status: 'normal',
        observation_date: new Date('2025-02-01'),
      },
      {
        test_name: 'Glucose',
        unit: 'mg/dL',
        numeric_value: 95,
        range_status: 'normal',
        observation_date: new Date('2025-05-01'),
      },
    ];

    const trends = computeLongitudinalTrends(unordered);
    assert.strictEqual(trends.length, 2);

    const plateletTrend = trends.find((t) => t.test_name.toLowerCase().includes('platelet'));
    assert.ok(plateletTrend);
    assert.strictEqual(plateletTrend.previous_value, 220);
    assert.strictEqual(plateletTrend.latest_value, 280);
    assert.strictEqual(plateletTrend.direction, 'up');
  });

  await t.test('handles empty input gracefully', () => {
    const trends = computeLongitudinalTrends([]);
    assert.deepStrictEqual(trends, []);
  });
});
