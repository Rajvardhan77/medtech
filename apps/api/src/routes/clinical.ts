import { Router, Request, Response } from 'express';
import {
  CreateSymptomSchema,
  CreateConditionSchema,
  CreateAllergySchema,
  CreateMedicationSchema,
} from '@medlens/shared-types';
import { prisma } from '../prisma';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { logAudit, extractClientIp } from '../middleware/audit';
import { encryptField, decryptField } from '../utils/crypto';

const router = Router();

async function verifyPatientAccess(
  patientId: string,
  req: Request
): Promise<{ errorStatus?: number; errorMessage?: string }> {
  const patient = await prisma.patient.findUnique({ where: { id: patientId } });
  if (!patient || patient.deleted_at) {
    return { errorStatus: 404, errorMessage: 'Patient record not found' };
  }
  if (req.user!.role === 'patient' && patient.user_id !== req.user!.id) {
    return { errorStatus: 403, errorMessage: 'Forbidden: Access restricted to patient owner' };
  }
  return {};
}

// ==========================================
// Symptoms
// ==========================================
router.post('/patients/:patientId/symptoms', authenticate, validateBody(CreateSymptomSchema), async (req: Request, res: Response) => {
  const { patientId } = req.params;
  const data = req.body;

  const check = await verifyPatientAccess(patientId, req);
  if (check.errorStatus) {
    return res.status(check.errorStatus).json({ error: check.errorMessage });
  }

  const symptom = await prisma.symptom.create({
    data: {
      patient_id: patientId,
      symptom_name: data.symptom_name,
      severity: data.severity ?? null,
      notes: encryptField(data.notes),
      source: data.source || 'user_input',
      confidence: data.confidence ?? null,
      source_document_id: data.source_document_id ?? null,
    },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Symptom',
    entityId: symptom.id,
    newValue: JSON.stringify({ ...symptom, notes: '[ENCRYPTED]' }),
    ipAddress: extractClientIp(req),
  });

  res.status(201).json({
    symptom: {
      ...symptom,
      notes: decryptField(symptom.notes),
    },
  });
});

router.delete('/symptoms/:id', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.symptom.findUnique({
    where: { id },
    include: { patient: true },
  });
  if (!existing || !existing.patient || existing.patient.deleted_at) {
    return res.status(404).json({ error: 'Symptom record not found' });
  }
  if (req.user!.role === 'patient' && existing.patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
  }

  const deleted = await prisma.symptom.delete({ where: { id } });

  await logAudit({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'Symptom',
    entityId: id,
    oldValue: JSON.stringify({ ...deleted, notes: '[ENCRYPTED]' }),
    ipAddress: extractClientIp(req),
  });

  res.json({ message: 'Symptom removed successfully' });
});

// ==========================================
// Conditions
// ==========================================
router.post('/patients/:patientId/conditions', authenticate, validateBody(CreateConditionSchema), async (req: Request, res: Response) => {
  const { patientId } = req.params;
  const data = req.body;

  const check = await verifyPatientAccess(patientId, req);
  if (check.errorStatus) {
    return res.status(check.errorStatus).json({ error: check.errorMessage });
  }

  const condition = await prisma.condition.create({
    data: {
      patient_id: patientId,
      condition_name: data.condition_name,
      clinical_status: data.clinical_status ?? 'active',
      onsetDate: data.onsetDate ? new Date(data.onsetDate) : null,
      notes: encryptField(data.notes),
      source: data.source || 'user_input',
      confidence: data.confidence ?? null,
      source_document_id: data.source_document_id ?? null,
    },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Condition',
    entityId: condition.id,
    newValue: JSON.stringify({ ...condition, notes: '[ENCRYPTED]' }),
    ipAddress: extractClientIp(req),
  });

  res.status(201).json({
    condition: {
      ...condition,
      notes: decryptField(condition.notes),
    },
  });
});

router.delete('/conditions/:id', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.condition.findUnique({
    where: { id },
    include: { patient: true },
  });
  if (!existing || !existing.patient || existing.patient.deleted_at) {
    return res.status(404).json({ error: 'Condition record not found' });
  }
  if (req.user!.role === 'patient' && existing.patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
  }

  const deleted = await prisma.condition.delete({ where: { id } });

  await logAudit({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'Condition',
    entityId: id,
    oldValue: JSON.stringify(deleted),
    ipAddress: extractClientIp(req),
  });

  res.json({ message: 'Condition removed successfully' });
});

// ==========================================
// Allergies
// ==========================================
router.post('/patients/:patientId/allergies', authenticate, validateBody(CreateAllergySchema), async (req: Request, res: Response) => {
  const { patientId } = req.params;
  const data = req.body;

  const check = await verifyPatientAccess(patientId, req);
  if (check.errorStatus) {
    return res.status(check.errorStatus).json({ error: check.errorMessage });
  }

  const allergy = await prisma.allergy.create({
    data: {
      patient_id: patientId,
      allergen: data.allergen,
      category: data.category ?? null,
      reaction: encryptField(data.reaction),
      severity: data.severity ?? null,
      source: data.source || 'user_input',
      confidence: data.confidence ?? null,
      source_document_id: data.source_document_id ?? null,
    },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Allergy',
    entityId: allergy.id,
    newValue: JSON.stringify({ ...allergy, reaction: '[ENCRYPTED]' }),
    ipAddress: extractClientIp(req),
  });

  res.status(201).json({
    allergy: {
      ...allergy,
      reaction: decryptField(allergy.reaction),
    },
  });
});

router.delete('/allergies/:id', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.allergy.findUnique({
    where: { id },
    include: { patient: true },
  });
  if (!existing || !existing.patient || existing.patient.deleted_at) {
    return res.status(404).json({ error: 'Allergy record not found' });
  }
  if (req.user!.role === 'patient' && existing.patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
  }

  const deleted = await prisma.allergy.delete({ where: { id } });

  await logAudit({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'Allergy',
    entityId: id,
    oldValue: JSON.stringify({ ...deleted, reaction: '[ENCRYPTED]' }),
    ipAddress: extractClientIp(req),
  });

  res.json({ message: 'Allergy removed successfully' });
});

// ==========================================
// Medications
// ==========================================
router.post('/patients/:patientId/medications', authenticate, validateBody(CreateMedicationSchema), async (req: Request, res: Response) => {
  const { patientId } = req.params;
  const data = req.body;

  const check = await verifyPatientAccess(patientId, req);
  if (check.errorStatus) {
    return res.status(check.errorStatus).json({ error: check.errorMessage });
  }

  const medication = await prisma.medication.create({
    data: {
      patient_id: patientId,
      medication_name: data.medication_name,
      dosage: data.dosage ?? null,
      frequency: data.frequency ?? null,
      status: data.status || 'active',
      source: data.source || 'user_input',
      confidence: data.confidence ?? null,
      source_document_id: data.source_document_id ?? null,
    },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Medication',
    entityId: medication.id,
    newValue: JSON.stringify(medication),
    ipAddress: extractClientIp(req),
  });

  res.status(201).json({ medication });
});

router.delete('/medications/:id', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.medication.findUnique({
    where: { id },
    include: { patient: true },
  });
  if (!existing || !existing.patient || existing.patient.deleted_at) {
    return res.status(404).json({ error: 'Medication record not found' });
  }
  if (req.user!.role === 'patient' && existing.patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
  }

  const deleted = await prisma.medication.delete({ where: { id } });

  await logAudit({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'Medication',
    entityId: id,
    oldValue: JSON.stringify(deleted),
    ipAddress: extractClientIp(req),
  });

  res.json({ message: 'Medication removed successfully' });
});

export default router;
