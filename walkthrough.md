# MedLens Implementation Walkthrough

MedLens is a clinical information intelligence platform designed to extract, analyze, and manage longitudinal patient clinical data, lab reports, medications, and conflicts.

## Architecture & Implementation Overview

1. **API Layer (`apps/api`)**:
   - Express REST API with TypeScript and modular route handlers.
   - Database operations managed via Prisma ORM.
   - JWT-based authentication with role-based access control (`clinician` vs `patient`).
   - Audit logging middleware capturing client IP addresses and user actions.
   - Deterministic clinical range calculation and conflict detection services.
   - AES-256-GCM field-level encryption for sensitive clinical notes and reactions.
   - AI document extraction via Anthropic Claude model.

2. **Shared Types & Domain Logic (`packages/shared-types`)**:
   - Strict Zod schemas validating API payloads, query parameters, and entities.
   - Pure, deterministic arithmetic evaluation of clinical reference ranges.

3. **Client Interface (`medlens.html`)**:
   - Single-file web interface with passcode gating, patient profile management, document viewing, and audit logs.

## Known Limitations

- **(a) PDF/image OCR not implemented** — only plain text file uploads are reliably processed end-to-end.
- **(b) Frontend is the static `medlens.html` prototype**, not a separate Next.js app.
- **(c) Field-level encryption covers only `Symptom.notes`, `Condition.notes`, and `Allergy.reaction`**.
- **(d) Local disk storage only**, no S3.
- **(e) Image-based reports are rejected with a clear error message** rather than processed.

## Verification & Test Results

- All test suites in `@medlens/api` and `@medlens/shared-types` pass with 100% success.
- TypeScript compiler builds clean without diagnostic errors across the monorepo.
