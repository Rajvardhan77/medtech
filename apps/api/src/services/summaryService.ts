import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../prisma';
import { config } from '../config';

const SUMMARY_SYSTEM = `You write short, warm, plain-language summaries of a patient's organized medical information for the patient themselves to read.
RULES YOU MUST ALWAYS FOLLOW:
- Never provide a diagnosis, never suggest a treatment, never suggest medication or dosage changes.
- Never state a value is dangerous or safe — only restate whether it was flagged low/normal/high per the provided reference range, using neutral language.
- Keep it under 250 words, second person ("you"/"your"), plain sentences, no medical jargon left unexplained.
- If information is incomplete or tests are pending, state so plainly rather than filling gaps.
- End with a short line encouraging the person to discuss these details with their clinician.
- Respond with ONLY plain text. No markdown headers, no JSON.`;

export async function generatePatientSummary(patientId: string): Promise<{ summaryText: string; citedFieldIds: string[] }> {
  const [conditions, allergies, medications, tests] = await Promise.all([
    prisma.condition.findMany({ where: { patient_id: patientId } }),
    prisma.allergy.findMany({ where: { patient_id: patientId } }),
    prisma.medication.findMany({ where: { patient_id: patientId, status: 'active' } }),
    prisma.extractedTest.findMany({ where: { patient_id: patientId } }),
  ]);

  const citedFieldIds: string[] = [
    ...conditions.map((c) => c.id),
    ...allergies.map((a) => a.id),
    ...medications.map((m) => m.id),
    ...tests.map((t) => t.id),
  ];

  if (!config.ANTHROPIC_API_KEY) {
    // Fallback deterministic summary when offline/API key is unset
    const lines = [
      `Your health overview includes ${conditions.length} condition(s), ${allergies.length} allergy record(s), and ${medications.length} active medication(s).`,
      tests.length > 0 ? `We have recorded ${tests.length} laboratory test result(s).` : 'No laboratory tests have been uploaded yet.',
      'Please consult your clinician to discuss your complete clinical profile.',
    ];
    return { summaryText: lines.join('\n\n'), citedFieldIds };
  }

  const payload = {
    conditions: conditions.map((c) => c.condition_name),
    allergies: allergies.map((a) => a.allergen),
    active_medications: medications.map((m) => `${m.medication_name} ${m.dosage || ''}`.trim()),
    recent_tests: tests.slice(0, 10).map((t) => ({
      name: t.test_name,
      value: t.value,
      unit: t.unit,
      flag: t.range_status,
    })),
  };

  const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });
  const response = await anthropic.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 600,
    system: SUMMARY_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Structured patient record:\n${JSON.stringify(payload)}`,
      },
    ],
  });

  const contentBlock = response.content[0];
  const summaryText = contentBlock && contentBlock.type === 'text' ? contentBlock.text.trim() : 'Summary could not be generated.';
  return { summaryText, citedFieldIds };
}
