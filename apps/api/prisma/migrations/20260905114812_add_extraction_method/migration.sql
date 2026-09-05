-- AlterTable
ALTER TABLE "ai_summaries" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "cited_field_ids" DROP DEFAULT;

-- AlterTable
ALTER TABLE "allergies" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "conditions" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "conflict_flags" ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "related_record_ids" DROP DEFAULT;

-- AlterTable
ALTER TABLE "consent_records" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "documents" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "extracted_tests" ADD COLUMN     "extraction_method" VARCHAR(64) NOT NULL DEFAULT 'ai',
ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "medications" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "patients" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "symptoms" ALTER COLUMN "id" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "id" DROP DEFAULT;
