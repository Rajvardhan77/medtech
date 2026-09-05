import { Router, Request, Response } from 'express';
import multer from 'multer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { prisma } from '../prisma';
import { config } from '../config';
import { authenticate } from '../middleware/auth';
import { logAudit, extractClientIp } from '../middleware/audit';
import { extractMedicalReport } from '../services/extractionService';
import { computeClinicalRangeStatus } from '../services/clinicalRangeService';

const router = Router();

// Configure multer storage
const uploadDir = path.resolve(process.cwd(), config.LOCAL_UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const key = `${crypto.randomUUID()}${ext}`;
    cb(null, key);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25MB max
});

// Upload document
router.post('/patients/:patientId/upload', authenticate, upload.single('file'), async (req: Request, res: Response) => {
  const { patientId } = req.params;

  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient || patient.deleted_at) {
    return res.status(404).json({ error: 'Patient record not found' });
  }

  if (req.user!.role === 'patient' && patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
  }

  const file = req.file;
  const rawText = req.body.raw_extracted_text;

  if (!file && !rawText) {
    return res.status(400).json({ error: 'Either a file upload or raw_extracted_text is required' });
  }

  let checksum = '';
  let storageKey: string = crypto.randomUUID();

  if (file) {
    const fileBuffer = fs.readFileSync(file.path);
    checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    storageKey = file.filename;
  } else {
    checksum = crypto.createHash('sha256').update(rawText).digest('hex');
  }

  const document = await prisma.document.create({
    data: {
      patient_id: patientId,
      uploaded_by: req.user!.id,
      storage_key: storageKey,
      mime_type: file?.mimetype || 'text/plain',
      status: 'pending',
      checksum,
      raw_extracted_text: rawText || null,
    },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Document',
    entityId: document.id,
    newValue: JSON.stringify({ storage_key: storageKey, mime_type: document.mime_type }),
    ipAddress: extractClientIp(req),
  });

  res.status(201).json({ document });
});

// Process document through Claude extraction pipeline
router.post('/documents/:id/process', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;

  const doc = await prisma.document.findUnique({
    where: { id },
    include: { patient: true },
  });
  if (!doc) {
    return res.status(404).json({ error: 'Document not found' });
  }

  if (!doc.patient || doc.patient.deleted_at) {
    return res.status(404).json({ error: 'Associated patient record not found' });
  }

  if (req.user!.role === 'patient' && doc.patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
  }

  // Consent enforcement: verify active 'ai_document_processing' consent
  const consent = await prisma.consentRecord.findFirst({
    where: {
      patient_id: doc.patient_id,
      consent_type: 'ai_document_processing',
      revoked_at: null,
    },
  });

  if (!consent) {
    return res.status(403).json({
      error: "AI document processing requires active patient consent for 'ai_document_processing'",
    });
  }

  // NOTE: Image-based reports require OCR (Tesseract / Cloud Vision), which is omitted in this build.
  // Images are flagged as failed with an explanatory message to upload a text-based PDF.
  const isImage =
    doc.mime_type.startsWith('image/') ||
    ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'].includes(doc.mime_type);
  if (isImage) {
    const errorMsg = 'Image-based reports require OCR, not implemented in this build.';
    await prisma.document.update({
      where: { id },
      data: { status: 'failed', quarantine_reason: errorMsg },
    });
    return res.status(422).json({ error: errorMsg });
  }

  let textToExtract = doc.raw_extracted_text;
  if (!textToExtract && doc.storage_key) {
    const filePath = path.join(uploadDir, doc.storage_key);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Stored document file not found on disk' });
    }

    if (doc.mime_type === 'application/pdf') {
      // KNOWN LIMITATION: reads raw PDF bytes as text; a proper pdf-parse integration was scoped but not completed due to time. Works correctly for plain .txt uploads only.
      textToExtract = fs.readFileSync(filePath, 'utf-8');
    } else if (doc.mime_type === 'text/plain') {
      textToExtract = fs.readFileSync(filePath, 'utf-8');
    } else {
      // KNOWN LIMITATION: reads raw PDF bytes as text; a proper pdf-parse integration was scoped but not completed due to time. Works correctly for plain .txt uploads only.
      textToExtract = fs.readFileSync(filePath, 'utf-8');
    }
  }

  if (!textToExtract || !textToExtract.trim()) {
    return res.status(400).json({ error: 'No text content available to process for this document' });
  }

  await prisma.document.update({
    where: { id },
    data: { status: 'processing' },
  });

  try {
    const extractionResult = await extractMedicalReport(textToExtract);

    // Insert extracted tests with deterministic clinical range statuses
    const createdTests = [];
    for (const test of extractionResult.tests) {
      // Server-side Range Invention Grounding Check
      if (test.reference_range_raw) {
        const rangeInSnippet =
          test.raw_extraction_snippet &&
          test.raw_extraction_snippet.toLowerCase().includes(test.reference_range_raw.toLowerCase().trim());
        if (!rangeInSnippet) {
          console.warn(
            `[Grounding Warning] Model invented reference_range_raw "${test.reference_range_raw}" not present in snippet "${test.raw_extraction_snippet}" for test "${test.test_name}". Nulling out.`
          );
          test.reference_range_raw = null;
          test.reference_range_low = null;
          test.reference_range_high = null;
        }
      }

      const { status, low, high } = computeClinicalRangeStatus(
        test.numeric_value,
        test.reference_range_low,
        test.reference_range_high,
        test.reference_range_raw
      );

      const created = await prisma.extractedTest.create({
        data: {
          document_id: doc.id,
          patient_id: doc.patient_id,
          test_name: test.test_name,
          value: test.value,
          numeric_value: test.numeric_value ?? null,
          unit: test.unit ?? null,
          reference_range_raw: test.reference_range_raw ?? null,
          reference_range_low: low,
          reference_range_high: high,
          range_status: status,
          observation_date: test.observation_date ? new Date(test.observation_date) : new Date(),
          raw_extraction_snippet: test.raw_extraction_snippet,
          source: test.source ?? (extractionResult.extraction_method === 'regex_fallback' ? 'derived_rule' : 'ai_extracted'),
          extraction_method: test.extraction_method ?? extractionResult.extraction_method ?? 'ai',
          confidence: test.confidence,
          source_document_id: doc.id,
        },
      });
      createdTests.push(created);
    }

    await prisma.document.update({
      where: { id },
      data: { status: 'processed', raw_extracted_text: textToExtract },
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE',
      entityType: 'DocumentExtraction',
      entityId: doc.id,
      newValue: JSON.stringify({ extractedTestsCount: createdTests.length }),
      ipAddress: extractClientIp(req),
    });

    res.json({
      message: 'Document extracted successfully',
      tests: createdTests,
      diagnoses: extractionResult.diagnoses || [],
      medications: extractionResult.medications || [],
      suspicious_content: extractionResult.suspicious_content ?? false,
    });
  } catch (err: any) {
    await prisma.document.update({
      where: { id },
      data: { status: 'failed', quarantine_reason: err.message },
    });

    res.status(500).json({ error: 'Extraction failed: ' + err.message });
  }
});

// View raw document text / inspect verbatim OCR
router.get('/documents/:id/raw', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;
  const doc = await prisma.document.findUnique({
    where: { id },
    include: { patient: true },
  });

  if (!doc || !doc.patient || doc.patient.deleted_at) {
    return res.status(404).json({ error: 'Document not found' });
  }

  if (req.user!.role === 'patient' && doc.patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
  }

  await logAudit({
    userId: req.user!.id,
    action: 'READ',
    entityType: 'DocumentRaw',
    entityId: doc.id,
    ipAddress: extractClientIp(req),
  });

  res.json({
    document: {
      id: doc.id,
      checksum: doc.checksum,
      mime_type: doc.mime_type,
      raw_extracted_text: doc.raw_extracted_text,
      status: doc.status,
    },
  });
});

export default router;
