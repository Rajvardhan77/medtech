import { z } from 'zod';

// ==========================================
// Provenance Types (Phase 0 Non-Negotiable)
// ==========================================
export const ProvenanceSourceEnum = z.enum([
  'user_input',
  'ai_extracted',
  'ai_generated',
  'derived_rule',
]);
export type ProvenanceSource = z.infer<typeof ProvenanceSourceEnum>;

export const ProvenanceSchema = z.object({
  source: ProvenanceSourceEnum,
  confidence: z.number().min(0).max(1).nullable().optional(),
  source_document_id: z.string().uuid().nullable().optional(),
  reviewed_by: z.string().uuid().nullable().optional(),
  reviewed_at: z.coerce.date().nullable().optional(),
});
export type Provenance = z.infer<typeof ProvenanceSchema>;

// ==========================================
// Clinical Range Status (Phase 6 Deterministic)
// ==========================================
export const RangeStatusEnum = z.enum([
  'normal',
  'low',
  'high',
  'critical_low',
  'critical_high',
  'not_provided_in_source',
]);
export type RangeStatus = z.infer<typeof RangeStatusEnum>;

// Deterministic range calculation function (Pure arithmetic, zero LLM guesswork)
export function evaluateRangeStatus(
  numericValue: number | null | undefined,
  refLow: number | null | undefined,
  refHigh: number | null | undefined
): RangeStatus {
  if (numericValue === null || numericValue === undefined || isNaN(numericValue)) {
    return 'not_provided_in_source';
  }
  const hasLow = refLow !== null && refLow !== undefined && !isNaN(refLow);
  const hasHigh = refHigh !== null && refHigh !== undefined && !isNaN(refHigh);

  if (!hasLow && !hasHigh) {
    return 'not_provided_in_source';
  }
  if (hasLow) {
    const criticalLowThreshold = (refLow as number) * 0.8;
    if (numericValue < criticalLowThreshold) {
      return 'critical_low';
    }
    if (numericValue < (refLow as number)) {
      return 'low';
    }
  }
  if (hasHigh) {
    const criticalHighThreshold = (refHigh as number) * 1.2;
    if (numericValue > criticalHighThreshold) {
      return 'critical_high';
    }
    if (numericValue > (refHigh as number)) {
      return 'high';
    }
  }
  return 'normal';
}

// ==========================================
// Conflict Flag & Document Status Enums
// ==========================================
export const ConflictTypeEnum = z.enum([
  'allergy_medication',
  'value_mismatch',
  'identity_mismatch',
  'duplicate_test',
]);
export type ConflictType = z.infer<typeof ConflictTypeEnum>;

export const ConflictStatusEnum = z.enum([
  'open',
  'acknowledged',
  'resolved',
]);
export type ConflictStatus = z.infer<typeof ConflictStatusEnum>;

export const DetectedByEnum = z.enum([
  'rule',
  'ai',
]);
export type DetectedBy = z.infer<typeof DetectedByEnum>;

export const DocumentStatusEnum = z.enum([
  'pending',
  'processing',
  'processed',
  'failed',
  'quarantined',
]);
export type DocumentStatus = z.infer<typeof DocumentStatusEnum>;

export const UserRoleEnum = z.enum([
  'patient',
  'clinician',
  'admin',
]);
export type UserRole = z.infer<typeof UserRoleEnum>;

// ==========================================
// User & Auth Schemas
// ==========================================
export const UserRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  role: UserRoleEnum.default('patient'),
});
export type UserRegisterInput = z.infer<typeof UserRegisterSchema>;

export const UserLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
export type UserLoginInput = z.infer<typeof UserLoginSchema>;

export const UserResponseSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: UserRoleEnum,
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type UserResponse = z.infer<typeof UserResponseSchema>;

// ==========================================
// Patient Schemas
// ==========================================
export const CreatePatientSchema = z.object({
  user_id: z.string().uuid().nullable().optional(),
  age: z.number().int().min(0).max(130).nullable().optional(),
  sex: z.string().max(32).nullable().optional(),
  source: ProvenanceSourceEnum.default('user_input'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source_document_id: z.string().uuid().nullable().optional(),
});
export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;

export const UpdatePatientSchema = z.object({
  age: z.number().int().min(0).max(130).nullable().optional(),
  sex: z.string().max(32).nullable().optional(),
  reviewed_by: z.string().uuid().nullable().optional(),
  reviewed_at: z.coerce.date().nullable().optional(),
});
export type UpdatePatientInput = z.infer<typeof UpdatePatientSchema>;

export const PatientResponseSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  age: z.number().nullable(),
  sex: z.string().nullable(),
  created_by: z.string().uuid(),
  source: ProvenanceSourceEnum,
  confidence: z.number().nullable(),
  source_document_id: z.string().uuid().nullable(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.coerce.date().nullable(),
  deleted_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type PatientResponse = z.infer<typeof PatientResponseSchema>;

// ==========================================
// Clinical Entities Schemas (Symptoms, Conditions, Allergies, Medications)
// ==========================================
export const CreateSymptomSchema = z.object({
  symptom_name: z.string().min(1),
  severity: z.string().max(32).nullable().optional(),
  notes: z.string().nullable().optional(),
  source: ProvenanceSourceEnum.default('user_input'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source_document_id: z.string().uuid().nullable().optional(),
});
export type CreateSymptomInput = z.infer<typeof CreateSymptomSchema>;

export const SymptomResponseSchema = CreateSymptomSchema.extend({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type SymptomResponse = z.infer<typeof SymptomResponseSchema>;

export const CreateConditionSchema = z.object({
  condition_name: z.string().min(1),
  clinical_status: z.enum(['active', 'recurrence', 'relapse', 'remission', 'resolved']).nullable().optional(),
  onsetDate: z.coerce.date().nullable().optional(),
  notes: z.string().nullable().optional(),
  source: ProvenanceSourceEnum.default('user_input'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source_document_id: z.string().uuid().nullable().optional(),
});
export type CreateConditionInput = z.infer<typeof CreateConditionSchema>;

export const ConditionResponseSchema = CreateConditionSchema.extend({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type ConditionResponse = z.infer<typeof ConditionResponseSchema>;

export const CreateAllergySchema = z.object({
  allergen: z.string().min(1),
  category: z.enum(['drug', 'food', 'environment', 'biologic']).nullable().optional(),
  reaction: z.string().nullable().optional(),
  severity: z.enum(['mild', 'moderate', 'severe']).nullable().optional(),
  source: ProvenanceSourceEnum.default('user_input'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source_document_id: z.string().uuid().nullable().optional(),
});
export type CreateAllergyInput = z.infer<typeof CreateAllergySchema>;

export const AllergyResponseSchema = CreateAllergySchema.extend({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type AllergyResponse = z.infer<typeof AllergyResponseSchema>;

export const CreateMedicationSchema = z.object({
  medication_name: z.string().min(1),
  dosage: z.string().max(128).nullable().optional(),
  frequency: z.string().max(128).nullable().optional(),
  status: z.string().max(32).default('active'),
  source: ProvenanceSourceEnum.default('user_input'),
  confidence: z.number().min(0).max(1).nullable().optional(),
  source_document_id: z.string().uuid().nullable().optional(),
});
export type CreateMedicationInput = z.infer<typeof CreateMedicationSchema>;

export const MedicationResponseSchema = CreateMedicationSchema.extend({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type MedicationResponse = z.infer<typeof MedicationResponseSchema>;

// ==========================================
// Document & Extracted Test Schemas
// ==========================================
export const DocumentResponseSchema = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  uploaded_by: z.string().uuid(),
  storage_key: z.string(),
  mime_type: z.string(),
  status: DocumentStatusEnum,
  checksum: z.string(),
  raw_extracted_text: z.string().nullable(),
  quarantine_reason: z.string().nullable(),
  uploaded_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type DocumentResponse = z.infer<typeof DocumentResponseSchema>;

export const CreateExtractedTestSchema = z.object({
  document_id: z.string().uuid(),
  test_name: z.string().min(1),
  value: z.string(),
  numeric_value: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  reference_range_raw: z.string().nullable().optional(),
  reference_range_low: z.number().nullable().optional(),
  reference_range_high: z.number().nullable().optional(),
  range_status: RangeStatusEnum.default('not_provided_in_source'),
  observation_date: z.coerce.date().nullable().optional(),
  raw_extraction_snippet: z.string(),
  source: ProvenanceSourceEnum.default('ai_extracted'),
  confidence: z.number().min(0).max(1),
  source_document_id: z.string().uuid(),
});
export type CreateExtractedTestInput = z.infer<typeof CreateExtractedTestSchema>;

export const ExtractedTestResponseSchema = CreateExtractedTestSchema.extend({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  reviewed_by: z.string().uuid().nullable(),
  reviewed_at: z.coerce.date().nullable(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type ExtractedTestResponse = z.infer<typeof ExtractedTestResponseSchema>;

// ==========================================
// Conflict Flag Schemas
// ==========================================
export const CreateConflictFlagSchema = z.object({
  type: ConflictTypeEnum,
  description: z.string().min(1),
  related_record_ids: z.array(z.string().uuid()).default([]),
  status: ConflictStatusEnum.default('open'),
  detected_by: DetectedByEnum.default('rule'),
});
export type CreateConflictFlagInput = z.infer<typeof CreateConflictFlagSchema>;

export const UpdateConflictFlagStatusSchema = z.object({
  status: ConflictStatusEnum,
});
export type UpdateConflictFlagStatusInput = z.infer<typeof UpdateConflictFlagStatusSchema>;

export const ConflictFlagResponseSchema = CreateConflictFlagSchema.extend({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
});
export type ConflictFlagResponse = z.infer<typeof ConflictFlagResponseSchema>;

// ==========================================
// AI Summary Schemas
// ==========================================
export const GenerateAISummarySchema = z.object({
  model_version: z.string().default('claude-3-5-sonnet'),
});
export type GenerateAISummaryInput = z.infer<typeof GenerateAISummarySchema>;

export const AISummaryResponseSchema = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  generated_at: z.coerce.date(),
  model_version: z.string(),
  summary_text: z.string(),
  cited_field_ids: z.array(z.string()),
  disclaimer_shown: z.boolean(),
  created_at: z.coerce.date(),
});
export type AISummaryResponse = z.infer<typeof AISummaryResponseSchema>;

// ==========================================
// Audit Log Schemas
// ==========================================
export const AuditLogResponseSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid().nullable(),
  action: z.string(),
  entity_type: z.string(),
  entity_id: z.string().uuid(),
  field_changed: z.string().nullable(),
  old_value: z.string().nullable(),
  new_value: z.string().nullable(),
  ip_address: z.string().nullable(),
  timestamp: z.coerce.date(),
});
export type AuditLogResponse = z.infer<typeof AuditLogResponseSchema>;

// ==========================================
// Consent Record Schemas
// ==========================================
export const ConsentTypeEnum = z.enum([
  'ai_document_processing',
  'clinician_sharing',
  'data_export',
]);
export type ConsentType = z.infer<typeof ConsentTypeEnum>;

export const CreateConsentRecordSchema = z.object({
  consent_type: ConsentTypeEnum,
});
export type CreateConsentRecordInput = z.infer<typeof CreateConsentRecordSchema>;

export const ConsentRecordResponseSchema = z.object({
  id: z.string().uuid(),
  patient_id: z.string().uuid(),
  consent_type: z.string(),
  granted_at: z.coerce.date(),
  revoked_at: z.coerce.date().nullable(),
});
export type ConsentRecordResponse = z.infer<typeof ConsentRecordResponseSchema>;
