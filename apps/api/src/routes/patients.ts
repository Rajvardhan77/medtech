import { Router, Request, Response } from 'express';
import { CreatePatientSchema, UpdatePatientSchema } from '@medlens/shared-types';
import { prisma } from '../prisma';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { logAudit, extractClientIp } from '../middleware/audit';
import { decryptField } from '../utils/crypto';

const router = Router();

// List patients (excluding soft-deleted)
router.get('/', authenticate, async (req: Request, res: Response) => {
  const { search } = req.query;

  const whereClause: any = {
    deleted_at: null,
  };

  // If patient role, only allow access to own patient record
  if (req.user!.role === 'patient') {
    whereClause.user_id = req.user!.id;
  }

  const patients = await prisma.patient.findMany({
    where: whereClause,
    orderBy: { updated_at: 'desc' },
    include: {
      user: { select: { email: true } },
      creator: { select: { email: true, role: true } },
      _count: {
        select: {
          symptoms: true,
          conditions: true,
          allergies: true,
          medications: true,
          extracted_tests: true,
          conflict_flags: true,
        },
      },
    },
  });

  res.json({ patients });
});

// Create patient profile
router.post('/', authenticate, validateBody(CreatePatientSchema), async (req: Request, res: Response) => {
  const { user_id, age, sex, source, confidence, source_document_id } = req.body;

  const patient = await prisma.patient.create({
    data: {
      user_id: user_id || (req.user!.role === 'patient' ? req.user!.id : null),
      age: age ?? null,
      sex: sex ?? null,
      created_by: req.user!.id,
      source: source || 'user_input',
      confidence: confidence ?? null,
      source_document_id: source_document_id ?? null,
    },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'Patient',
    entityId: patient.id,
    newValue: JSON.stringify({ age, sex, source }),
    ipAddress: extractClientIp(req),
  });

  res.status(201).json({ patient });
});

// Get detailed patient record
router.get('/:id', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;

  const patient = await prisma.patient.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, email: true } },
      creator: { select: { id: true, email: true, role: true } },
      reviewer: { select: { id: true, email: true } },
      symptoms: { orderBy: { created_at: 'desc' } },
      conditions: { orderBy: { created_at: 'desc' } },
      allergies: { orderBy: { created_at: 'desc' } },
      medications: { orderBy: { created_at: 'desc' } },
      extracted_tests: { orderBy: { observation_date: 'desc' } },
      conflict_flags: { orderBy: { created_at: 'desc' } },
      ai_summaries: { orderBy: { created_at: 'desc' }, take: 3 },
      documents: { orderBy: { uploaded_at: 'desc' } },
    },
  });

  if (!patient || patient.deleted_at) {
    return res.status(404).json({ error: 'Patient record not found' });
  }

  // Access control: Patients can only view their own record
  if (req.user!.role === 'patient' && patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
  }

  await logAudit({
    userId: req.user!.id,
    action: 'READ',
    entityType: 'Patient',
    entityId: patient.id,
    ipAddress: extractClientIp(req),
  });

  const decryptedPatient = {
    ...patient,
    symptoms: patient.symptoms.map((s) => ({ ...s, notes: decryptField(s.notes) })),
    conditions: patient.conditions.map((c) => ({ ...c, notes: decryptField(c.notes) })),
    allergies: patient.allergies.map((a) => ({ ...a, reaction: decryptField(a.reaction) })),
  };

  res.json({ patient: decryptedPatient });
});

// Update patient
router.put('/:id', authenticate, validateBody(UpdatePatientSchema), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { age, sex, reviewed_by, reviewed_at } = req.body;

  const existing = await prisma.patient.findUnique({ where: { id } });
  if (!existing || existing.deleted_at) {
    return res.status(404).json({ error: 'Patient record not found' });
  }

  const updated = await prisma.patient.update({
    where: { id },
    data: {
      ...(age !== undefined && { age }),
      ...(sex !== undefined && { sex }),
      ...(reviewed_by !== undefined && { reviewed_by }),
      ...(reviewed_at !== undefined && { reviewed_at: new Date(reviewed_at) }),
    },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'Patient',
    entityId: id,
    oldValue: JSON.stringify({ age: existing.age, sex: existing.sex }),
    newValue: JSON.stringify({ age: updated.age, sex: updated.sex }),
    ipAddress: extractClientIp(req),
  });

  res.json({ patient: updated });
});

// Soft-delete patient record
router.delete('/:id', authenticate, async (req: Request, res: Response) => {
  const { id } = req.params;

  const existing = await prisma.patient.findUnique({ where: { id } });
  if (!existing || existing.deleted_at) {
    return res.status(404).json({ error: 'Patient record not found' });
  }

  const softDeleted = await prisma.patient.update({
    where: { id },
    data: { deleted_at: new Date() },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'DELETE',
    entityType: 'Patient',
    entityId: id,
    newValue: JSON.stringify({ deleted_at: softDeleted.deleted_at }),
    ipAddress: extractClientIp(req),
  });

  res.json({ message: 'Patient profile soft-deleted successfully' });
});

export default router;
