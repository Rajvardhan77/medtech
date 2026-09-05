# MedLens — Clinical Information Intelligence

## 1. What MedLens Is and Is Not

- **What MedLens Is**: An intelligent clinical information organization system designed to aggregate, parse, structure, and track longitudinal patient health data. It ingests clinical documents and lab reports, extracts structured laboratory tests, conditions, medications, and allergies, computes deterministic reference-range flags, identifies clinical conflicts (such as allergy-medication overlaps), and provides auditable longitudinal health timelines.
- **What MedLens Is Not**: MedLens is **never a diagnostic tool**. It does **not** diagnose medical conditions, recommend clinical treatments, prescribe or alter medication dosages, or replace professional medical judgment. All extracted records, reference ranges, and AI-generated plain-language summaries are strictly informational and explicitly instruct patients to review all data with licensed healthcare clinicians.

---

## 2. Architecture Overview

MedLens is organized as a monorepo containing a production-grade backend pipeline and a standalone frontend demo prototype:

- **Backend Pipeline (`apps/api`)**:
  - A modular Node.js/Express REST API written in TypeScript.
  - Interacts with a relational database via **Prisma ORM**.
  - Provides authentication (JWT with bcrypt password hashing), role-based access control, security middleware, and write-once audit logging.
  - Implements server-side document ingestion, an Anthropic Claude extraction engine with prompt-injection defense, deterministic range status calculation, conflict detection rules, and field-level encryption.
- **Domain Models & Validation (`packages/shared-types`)**:
  - Shared TypeScript types and strict **Zod** validation schemas for all entities and API payloads.
  - Houses the pure, deterministic clinical reference-range arithmetic evaluator with zero external dependencies.
- **Frontend Prototype (`medlens.html`)**:
  - A static single-file HTML/JavaScript/CSS prototype served on port 3000.
  - Operates as an interactive proof-of-concept client using browser-local storage (`localStorage` / `Store` abstraction) and direct client-side model calls.
  - It is **not** a production connected Next.js application and operates independently of the `apps/api` backend endpoints.

---

## 3. Security & Safety Measures Implemented

Each security and safety control is implemented in the codebase as follows:

| Security / Safety Control | File Location | Implementation Details |
| :--- | :--- | :--- |
| **Prompt Injection Defense** | `apps/api/src/services/extractionService.ts` | System prompt isolates untrusted document text inside `<document></document>` tags, treats all enclosed text as literal data rather than instructions, instructs the model never to obey role shifts or system prompt overrides, and flags injection attempts with `suspicious_content: true` and explanatory notes. |
| **Range-Grounding Check** | `apps/api/src/routes/documents.ts` | Server-side validation verifies that any extracted `reference_range_raw` string is present as a verbatim substring within `raw_extraction_snippet`. If the model invents or hallucinates a reference range, the server nullifies `reference_range_raw`, `reference_range_low`, and `reference_range_high` before database insertion. |
| **Deterministic Range Flagging** | `packages/shared-types/src/index.ts` & `apps/api/src/services/clinicalRangeService.ts` | `evaluateRangeStatus()` uses pure arithmetic rather than LLM inference to categorize test values into `normal`, `low`, `high`, `critical_low`, `critical_high`, or `not_provided_in_source`. Values falling >20% beyond the reference low or high boundaries are flagged as `critical_low` or `critical_high`. |
| **Write-Once Audit Log** | `apps/api/src/middleware/audit.ts` | The `logAudit()` middleware writes immutable event records to the Prisma `AuditLog` table on all state-altering actions (`CREATE`, `READ`, `UPDATE`, `DELETE`), recording user ID, target entity, old/new values, timestamps, and client IP addresses resolved via proxy-safe `extractClientIp()`. |
| **Role-Based Access Control (RBAC)** | `apps/api/src/middleware/auth.ts` | JWT verification middleware (`authenticate`) combined with role checking (`requireRole('clinician')`). Restricts data mutations to authenticated users and prevents patient users from viewing or altering records belonging to other patients. |
| **Rate Limiting** | `apps/api/src/app.ts` | Uses `express-rate-limit` with two distinct tiers: a global limiter of 100 requests/minute on all `/api` routes, and a strict limiter of 5 requests/minute applied to authentication (`/api/auth`) and compute-heavy endpoints (`/api/documents/:id/process`, `/api/patients/:patientId/summaries`). |
| **Field-Level Encryption** | `apps/api/src/utils/crypto.ts`, `apps/api/src/routes/clinical.ts`, `apps/api/src/routes/patients.ts` | AES-256-GCM authenticated field encryption with unique 16-byte initialization vectors (IV) and 16-byte authentication tags. Applied selectively to sensitive free-text clinical fields: `Symptom.notes`, `Condition.notes`, and `Allergy.reaction`. |
| **Consent Gating** | `apps/api/src/routes/documents.ts` & `apps/api/src/routes/consent.ts` | Enforces explicit patient consent prior to automated processing. The `/api/documents/:id/process` route verifies that an active, unrevoked `ai_document_processing` consent record exists for the patient before triggering the extraction pipeline, returning `403 Forbidden` if absent. |

---

## 4. Known Limitations

- **(a) PDF/image OCR not implemented** — only plain text file uploads are reliably processed end-to-end.
- **(b) Frontend is the static `medlens.html` prototype**, not a separate Next.js app.
- **(c) Field-level encryption covers only `Symptom.notes`, `Condition.notes`, and `Allergy.reaction`**.
- **(d) Local disk storage only**, no S3.
- **(e) Image-based reports are rejected with a clear error message** rather than processed.

---

## 5. Test Coverage Summary

The automated test suite runs via the native Node.js test runner (`node --test`) across all workspaces, totaling **33 passing tests (0 failures)**:

### `@medlens/api` (26 Passing Tests)
1. **Audit Middleware - Client IP Extraction (4 tests)** (`test/audit.test.js`):
   - Extracts single IP from `x-forwarded-for` header.
   - Extracts first client IP from comma-separated proxy chain.
   - Falls back to socket `remoteAddress` when header is not present.
   - Returns `"unknown"` when neither forwarded header nor socket address is available.
2. **Clinical Range Service - String Parsing & Status (4 tests)** (`test/clinicalRange.test.js`):
   - Parses hyphenated numeric ranges (`"70 - 99"`).
   - Parses less-than upper bounds (`"< 200"`).
   - Parses greater-than lower bounds (`"> 60"`).
   - Computes clinical range status end-to-end with unit mappings.
3. **Conflict Detection Service - Deterministic Rules (5 tests)** (`test/conflict.test.js`):
   - Flags direct allergy-medication substring overlaps.
   - Flags penicillin cross-reactivity for amoxicillin, ampicillin, and augmentin.
   - Detects duplicate active medications by normalized name.
   - Ignores discontinued medications when detecting active duplicates.
   - Confirms zero false-positive conflicts on safe, distinct clinical entries.
4. **AES-256-GCM Field-Level Encryption (3 tests)** (`test/crypto.test.js`):
   - Encrypts and decrypts sensitive clinical text cleanly round-trip.
   - Handles `null`, `undefined`, and empty strings gracefully without throwing.
   - Gracefully falls back for legacy unencrypted plaintext data.
5. **Longitudinal Trends Service (5 tests)** (`test/trends.test.js`):
   - Computes `"up"` trend direction when values increase over time.
   - Computes `"down"` trend direction when values decrease over time.
   - Computes `"flat"` trend direction when values are equal or for single datapoints.
   - Sorts disordered observations chronologically and groups by normalized test name.
   - Handles empty input gracefully.

### `@medlens/shared-types` (7 Passing Tests)
1. **Clinical Range Evaluator - Pure Deterministic Arithmetic (7 tests)** (`test/range.test.js`):
   - Returns `not_provided_in_source` when value or reference bounds are missing or NaN.
   - Correctly evaluates `low` status below lower reference bound.
   - Correctly evaluates `critical_low` at exactly the 20% lower boundary and past it.
   - Correctly evaluates `high` status above upper reference bound.
   - Correctly evaluates `critical_high` at exactly the 20% upper boundary and past it.
   - Correctly evaluates `normal` status within reference boundaries.
