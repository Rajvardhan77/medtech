import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../prisma';
import { config } from '../config';

export interface RuleConflictResult {
  type: 'allergy_medication' | 'duplicate_test' | 'value_mismatch';
  description: string;
  relatedRecordIds: string[];
  severity: 'high' | 'medium' | 'low';
}

export interface AllergyInput {
  id: string;
  allergen: string;
}

export interface MedicationInput {
  id: string;
  medication_name: string;
  status?: string | null;
}

/**
 * Pure evaluation function for deterministic rule-based conflict checks.
 */
export function evaluateRuleConflicts(
  allergies: AllergyInput[],
  medications: MedicationInput[]
): RuleConflictResult[] {
  const conflicts: RuleConflictResult[] = [];

  // Filter to active medications if status is specified
  const activeMeds = medications.filter((m) => !m.status || m.status === 'active');

  // 1. Allergy-Medication Overlap
  for (const med of activeMeds) {
    const medLower = med.medication_name.toLowerCase();
    for (const al of allergies) {
      const alLower = al.allergen.toLowerCase();
      // Direct substring match or common antibiotic drug class patterns
      if (
        (alLower.length > 2 && medLower.includes(alLower)) ||
        (alLower.includes('penicillin') &&
          (medLower.includes('amoxicillin') || medLower.includes('ampicillin') || medLower.includes('augmentin')))
      ) {
        conflicts.push({
          type: 'allergy_medication',
          description: `Active medication "${med.medication_name}" conflicts with documented allergy "${al.allergen}". Immediate clinician review required.`,
          relatedRecordIds: [med.id, al.id],
          severity: 'high',
        });
      }
    }
  }

  // 2. Duplicate Active Medications
  const seenMeds = new Map<string, string>();
  for (const med of activeMeds) {
    const key = med.medication_name.trim().toLowerCase();
    if (seenMeds.has(key)) {
      conflicts.push({
        type: 'value_mismatch',
        description: `Medication "${med.medication_name}" appears multiple times in active medication profile. Verify duplicate prescription.`,
        relatedRecordIds: [med.id, seenMeds.get(key)!],
        severity: 'low',
      });
    } else {
      seenMeds.set(key, med.id);
    }
  }

  return conflicts;
}

/**
 * Deterministic rule-based conflict detector.
 */
export async function detectRuleBasedConflicts(patientId: string): Promise<RuleConflictResult[]> {
  const [allergies, medications] = await Promise.all([
    prisma.allergy.findMany({ where: { patient_id: patientId } }),
    prisma.medication.findMany({ where: { patient_id: patientId, status: 'active' } }),
  ]);

  return evaluateRuleConflicts(allergies, medications);
}

export interface DetectedConflict {
  description: string;
  severity: 'high' | 'medium' | 'low';
  detected_by: 'rule' | 'ai';
  type?: 'allergy_medication' | 'duplicate_test' | 'value_mismatch';
  relatedRecordIds?: string[];
}

/**
 * AI-assisted clinical conflict detection using Claude Sonnet.
 * Falls back to deterministic evaluateRuleConflicts on error or zero credits.
 */
export async function detectAIConflicts(patientId: string): Promise<DetectedConflict[]> {
  const [conditions, allergies, medications, symptoms, tests] = await Promise.all([
    prisma.condition.findMany({ where: { patient_id: patientId } }),
    prisma.allergy.findMany({ where: { patient_id: patientId } }),
    prisma.medication.findMany({ where: { patient_id: patientId } }),
    prisma.symptom.findMany({ where: { patient_id: patientId } }),
    prisma.extractedTest.findMany({ where: { patient_id: patientId } }),
  ]);

  if (config.ANTHROPIC_API_KEY) {
    try {
      const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
      const payload = {
        conditions: conditions.map((c) => ({ name: c.condition_name, status: c.clinical_status })),
        allergies: allergies.map((a) => ({ allergen: a.allergen, category: a.category, severity: a.severity })),
        medications: medications.map((m) => ({ name: m.medication_name, dosage: m.dosage, status: m.status })),
        symptoms: symptoms.map((s) => ({ name: s.symptom_name, severity: s.severity })),
        tests: tests.map((t) => ({ name: t.test_name, value: t.value, unit: t.unit, rangeStatus: t.range_status })),
      };

      const response = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 900,
        system: `You are a clinical-safety review assistant. You will receive a structured patient record JSON.
Identify POTENTIAL inconsistencies or notable interactions for a human clinician to review — for example a prescribed medication that overlaps with a stated allergy, medications that are typically contraindicated together, or lab findings that seem to conflict with stated conditions.
You are NOT diagnosing and NOT recommending any treatment or dosage change.
Respond with ONLY valid JSON: an array of objects:
[{"severity":"high"|"medium"|"low", "description": string}]
If you find nothing notable, respond with []. Keep each description to one or two sentences and always frame findings as something to verify with a clinician, never as fact.`,
        messages: [
          {
            role: 'user',
            content: `Patient record JSON:\n${JSON.stringify(payload)}`,
          },
        ],
      });

      const contentBlock = response.content[0];
      if (contentBlock && contentBlock.type === 'text') {
        try {
          const cleaned = contentBlock.text.replace(/```json/gi, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleaned);
          if (Array.isArray(parsed)) {
            return parsed.map((p: any) => ({
              description: p.description,
              severity: p.severity || 'medium',
              detected_by: 'ai' as const,
              type: 'value_mismatch' as const,
              relatedRecordIds: [],
            }));
          }
        } catch {
          // Fall through to fallback
        }
      }
    } catch (err: any) {
      console.warn(`[Conflict Detection] Anthropic API call failed (${err.message}). Falling back to evaluateRuleConflicts.`);
      const fallbackRules = evaluateRuleConflicts(allergies, medications);
      return fallbackRules.map((r) => ({
        description: r.description,
        severity: r.severity,
        detected_by: 'rule' as const,
        type: r.type,
        relatedRecordIds: r.relatedRecordIds,
      }));
    }
  } else {
    console.warn('[Conflict Detection] ANTHROPIC_API_KEY not configured. Falling back to evaluateRuleConflicts.');
    const fallbackRules = evaluateRuleConflicts(allergies, medications);
    return fallbackRules.map((r) => ({
      description: r.description,
      severity: r.severity,
      detected_by: 'rule' as const,
      type: r.type,
      relatedRecordIds: r.relatedRecordIds,
    }));
  }

  return [];
}
