-- MedLens Phase 1 Initial PostgreSQL Migration
-- Strict Relational Schema with Provenance, Soft-Delete Guarantees, and Numeric Range Separation

-- Enums
CREATE TYPE "Role" AS ENUM ('patient', 'clinician', 'admin');
CREATE TYPE "ProvenanceSource" AS ENUM ('user_input', 'ai_extracted', 'ai_generated', 'derived_rule');
CREATE TYPE "RangeStatus" AS ENUM ('normal', 'low', 'high', 'critical_low', 'critical_high', 'not_provided_in_source');
CREATE TYPE "DocumentStatus" AS ENUM ('pending', 'processing', 'processed', 'failed', 'quarantined');
CREATE TYPE "ConflictType" AS ENUM ('allergy_medication', 'value_mismatch', 'identity_mismatch', 'duplicate_test');
CREATE TYPE "ConflictStatus" AS ENUM ('open', 'acknowledged', 'resolved');
CREATE TYPE "DetectedBy" AS ENUM ('rule', 'ai');

-- Users Table
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "role" "Role" NOT NULL DEFAULT 'patient',
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "mfa_secret" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- Patients Table (Soft-deletable to guarantee audit integrity)
CREATE TABLE "patients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "age" INTEGER,
    "sex" VARCHAR(32),
    "created_by" UUID NOT NULL,
    "source" "ProvenanceSource" NOT NULL DEFAULT 'user_input',
    "confidence" DOUBLE PRECISION,
    "source_document_id" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "deleted_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "patients_user_id_key" ON "patients"("user_id");
CREATE INDEX "patients_user_id_idx" ON "patients"("user_id");
CREATE INDEX "patients_created_by_idx" ON "patients"("created_by");
CREATE INDEX "patients_deleted_at_idx" ON "patients"("deleted_at");

-- Symptoms Table
CREATE TABLE "symptoms" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "symptom_name" TEXT NOT NULL,
    "severity" VARCHAR(32),
    "notes" TEXT,
    "source" "ProvenanceSource" NOT NULL DEFAULT 'user_input',
    "confidence" DOUBLE PRECISION,
    "source_document_id" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "symptoms_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "symptoms_patient_id_idx" ON "symptoms"("patient_id");

-- Conditions Table
CREATE TABLE "conditions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "condition_name" TEXT NOT NULL,
    "clinical_status" VARCHAR(32),
    "onsetDate" DATE,
    "notes" TEXT,
    "source" "ProvenanceSource" NOT NULL DEFAULT 'user_input',
    "confidence" DOUBLE PRECISION,
    "source_document_id" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "conditions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "conditions_patient_id_idx" ON "conditions"("patient_id");

-- Allergies Table
CREATE TABLE "allergies" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "allergen" TEXT NOT NULL,
    "category" VARCHAR(64),
    "reaction" TEXT,
    "severity" VARCHAR(32),
    "source" "ProvenanceSource" NOT NULL DEFAULT 'user_input',
    "confidence" DOUBLE PRECISION,
    "source_document_id" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "allergies_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "allergies_patient_id_idx" ON "allergies"("patient_id");

-- Medications Table
CREATE TABLE "medications" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "medication_name" TEXT NOT NULL,
    "dosage" VARCHAR(128),
    "frequency" VARCHAR(128),
    "status" VARCHAR(32) DEFAULT 'active',
    "source" "ProvenanceSource" NOT NULL DEFAULT 'user_input',
    "confidence" DOUBLE PRECISION,
    "source_document_id" UUID,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "medications_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "medications_patient_id_idx" ON "medications"("patient_id");

-- Documents Table
CREATE TABLE "documents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "uploaded_by" UUID NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" VARCHAR(128) NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'pending',
    "checksum" VARCHAR(128) NOT NULL,
    "raw_extracted_text" TEXT,
    "quarantine_reason" TEXT,
    "uploaded_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "documents_storage_key_key" ON "documents"("storage_key");
CREATE INDEX "documents_patient_id_idx" ON "documents"("patient_id");
CREATE INDEX "documents_uploaded_by_idx" ON "documents"("uploaded_by");
CREATE INDEX "documents_status_idx" ON "documents"("status");

-- Extracted Tests Table (Distinct raw string vs. pure numeric bounds)
CREATE TABLE "extracted_tests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "document_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "test_name" VARCHAR(255) NOT NULL,
    "value" VARCHAR(64) NOT NULL,
    "numeric_value" DOUBLE PRECISION,
    "unit" VARCHAR(64),
    "reference_range_raw" TEXT,
    "reference_range_low" DOUBLE PRECISION,
    "reference_range_high" DOUBLE PRECISION,
    "range_status" "RangeStatus" NOT NULL DEFAULT 'not_provided_in_source',
    "observation_date" TIMESTAMPTZ(6),
    "raw_extraction_snippet" TEXT NOT NULL,
    "source" "ProvenanceSource" NOT NULL DEFAULT 'ai_extracted',
    "confidence" DOUBLE PRECISION NOT NULL,
    "source_document_id" UUID NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "extracted_tests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "extracted_tests_patient_id_idx" ON "extracted_tests"("patient_id");
CREATE INDEX "extracted_tests_document_id_idx" ON "extracted_tests"("document_id");
CREATE INDEX "extracted_tests_test_name_idx" ON "extracted_tests"("test_name");
CREATE INDEX "extracted_tests_observation_date_idx" ON "extracted_tests"("observation_date");
CREATE INDEX "extracted_tests_range_status_idx" ON "extracted_tests"("range_status");

-- Conflict Flags Table
CREATE TABLE "conflict_flags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "type" "ConflictType" NOT NULL,
    "description" TEXT NOT NULL,
    "related_record_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" "ConflictStatus" NOT NULL DEFAULT 'open',
    "detected_by" "DetectedBy" NOT NULL DEFAULT 'rule',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "conflict_flags_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "conflict_flags_patient_id_idx" ON "conflict_flags"("patient_id");
CREATE INDEX "conflict_flags_status_idx" ON "conflict_flags"("status");
CREATE INDEX "conflict_flags_type_idx" ON "conflict_flags"("type");

-- AI Summaries Table
CREATE TABLE "ai_summaries" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "model_version" VARCHAR(64) NOT NULL,
    "summary_text" TEXT NOT NULL,
    "cited_field_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "disclaimer_shown" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_summaries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ai_summaries_patient_id_idx" ON "ai_summaries"("patient_id");

-- Audit Logs Table
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID,
    "action" VARCHAR(64) NOT NULL,
    "entity_type" VARCHAR(64) NOT NULL,
    "entity_id" UUID NOT NULL,
    "field_changed" VARCHAR(128),
    "old_value" TEXT,
    "new_value" TEXT,
    "ip_address" VARCHAR(45),
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");
CREATE INDEX "audit_logs_timestamp_idx" ON "audit_logs"("timestamp");

-- Consent Records Table
CREATE TABLE "consent_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "patient_id" UUID NOT NULL,
    "consent_type" VARCHAR(64) NOT NULL,
    "granted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(6),
    CONSTRAINT "consent_records_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "consent_records_patient_id_idx" ON "consent_records"("patient_id");

-- Foreign Keys & Cascades (Restrict prevents accidental deletion of patients/records to preserve audit integrity)
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "patients" ADD CONSTRAINT "patients_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "patients" ADD CONSTRAINT "patients_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "symptoms" ADD CONSTRAINT "symptoms_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "symptoms" ADD CONSTRAINT "symptoms_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "symptoms" ADD CONSTRAINT "symptoms_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conditions" ADD CONSTRAINT "conditions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "conditions" ADD CONSTRAINT "conditions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "allergies" ADD CONSTRAINT "allergies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "medications" ADD CONSTRAINT "medications_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "medications" ADD CONSTRAINT "medications_source_document_id_fkey" FOREIGN KEY ("source_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "medications" ADD CONSTRAINT "medications_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "documents" ADD CONSTRAINT "documents_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "extracted_tests" ADD CONSTRAINT "extracted_tests_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "extracted_tests" ADD CONSTRAINT "extracted_tests_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "extracted_tests" ADD CONSTRAINT "extracted_tests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "conflict_flags" ADD CONSTRAINT "conflict_flags_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ai_summaries" ADD CONSTRAINT "ai_summaries_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "consent_records" ADD CONSTRAINT "consent_records_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
