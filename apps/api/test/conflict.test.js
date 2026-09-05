const test = require('node:test');
const assert = require('node:assert');
const { evaluateRuleConflicts } = require('../dist/services/conflictService.js');

test('Conflict Detection Service - Deterministic Rules', async (t) => {
  await t.test('flags direct allergy-medication substring overlap', () => {
    const allergies = [
      { id: 'al-1', allergen: 'Codeine' },
    ];
    const medications = [
      { id: 'med-1', medication_name: 'Codeine Phosphate 30mg', status: 'active' },
    ];

    const conflicts = evaluateRuleConflicts(allergies, medications);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].type, 'allergy_medication');
    assert.strictEqual(conflicts[0].severity, 'high');
    assert.deepStrictEqual(conflicts[0].relatedRecordIds, ['med-1', 'al-1']);
    assert.match(conflicts[0].description, /conflicts with documented allergy/);
  });

  await t.test('flags penicillin cross-reactivity for amoxicillin, ampicillin, and augmentin', () => {
    const allergies = [
      { id: 'al-pen', allergen: 'Penicillin' },
    ];
    const medications = [
      { id: 'med-amox', medication_name: 'Amoxicillin 500mg Oral Capsule', status: 'active' },
      { id: 'med-aug', medication_name: 'Augmentin 875mg', status: 'active' },
    ];

    const conflicts = evaluateRuleConflicts(allergies, medications);
    assert.strictEqual(conflicts.length, 2);
    assert.ok(conflicts.every((c) => c.type === 'allergy_medication' && c.severity === 'high'));
  });

  await t.test('detects duplicate active medications by normalized name', () => {
    const allergies = [];
    const medications = [
      { id: 'med-10', medication_name: 'Lisinopril 10mg', status: 'active' },
      { id: 'med-20', medication_name: 'lisinopril 10mg ', status: 'active' },
    ];

    const conflicts = evaluateRuleConflicts(allergies, medications);
    assert.strictEqual(conflicts.length, 1);
    assert.strictEqual(conflicts[0].type, 'value_mismatch');
    assert.strictEqual(conflicts[0].severity, 'low');
    assert.deepStrictEqual(conflicts[0].relatedRecordIds, ['med-20', 'med-10']);
    assert.match(conflicts[0].description, /appears multiple times in active medication profile/);
  });

  await t.test('ignores discontinued medications when detecting duplicate active prescriptions', () => {
    const allergies = [];
    const medications = [
      { id: 'med-old', medication_name: 'Metformin 500mg', status: 'discontinued' },
      { id: 'med-active', medication_name: 'Metformin 500mg', status: 'active' },
    ];

    const conflicts = evaluateRuleConflicts(allergies, medications);
    assert.strictEqual(conflicts.length, 0);
  });

  await t.test('returns no conflicts for safe and distinct clinical records', () => {
    const allergies = [
      { id: 'al-peanut', allergen: 'Peanuts' },
    ];
    const medications = [
      { id: 'med-atorva', medication_name: 'Atorvastatin 20mg', status: 'active' },
      { id: 'med-metro', medication_name: 'Metoprolol 50mg', status: 'active' },
    ];

    const conflicts = evaluateRuleConflicts(allergies, medications);
    assert.strictEqual(conflicts.length, 0);
  });
});
