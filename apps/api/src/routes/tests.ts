import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, requireRole } from '../middleware/auth';
import { logAudit, extractClientIp } from '../middleware/audit';
import { computeLongitudinalTrends } from '../services/trendService';

const router = Router();

// List extracted tests for patient
router.get('/patients/:patientId/tests', authenticate, async (req: Request, res: Response) => {
  const { patientId } = req.params;

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
  });

  if (!patient || patient.deleted_at) {
    return res.status(404).json({ error: 'Patient record not found' });
  }

  if (req.user!.role === 'patient' && patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
  }

  const tests = await prisma.extractedTest.findMany({
    where: { patient_id: patientId },
    orderBy: { observation_date: 'desc' },
    include: {
      reviewer: { select: { email: true } },
    },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'READ',
    entityType: 'ExtractedTest',
    entityId: patientId,
    ipAddress: extractClientIp(req),
  });

  res.json({ tests });
});

// Compute longitudinal test trends
router.get('/patients/:patientId/trends', authenticate, async (req: Request, res: Response) => {
  const { patientId } = req.params;

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
  });

  if (!patient || patient.deleted_at) {
    return res.status(404).json({ error: 'Patient record not found' });
  }

  if (req.user!.role === 'patient' && patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
  }

  const tests = await prisma.extractedTest.findMany({
    where: {
      patient_id: patientId,
      numeric_value: { not: null },
    },
    orderBy: { observation_date: 'asc' },
  });

  const trends = computeLongitudinalTrends(tests);

  await logAudit({
    userId: req.user!.id,
    action: 'READ',
    entityType: 'TestTrends',
    entityId: patientId,
    ipAddress: extractClientIp(req),
  });

  res.json({ trends });
});

// Clinician review & verification of extracted test
router.put('/tests/:id/review', authenticate, requireRole(['clinician', 'admin']), async (req: Request, res: Response) => {
  const { id } = req.params;

  const test = await prisma.extractedTest.findUnique({
    where: { id },
    include: { patient: true },
  });

  if (!test || !test.patient || test.patient.deleted_at) {
    return res.status(404).json({ error: 'Extracted test not found' });
  }

  const updated = await prisma.extractedTest.update({
    where: { id },
    data: {
      reviewed_by: req.user!.id,
      reviewed_at: new Date(),
    },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'VERIFY',
    entityType: 'ExtractedTest',
    entityId: id,
    newValue: JSON.stringify({ reviewed_by: req.user!.id, reviewed_at: updated.reviewed_at }),
    ipAddress: extractClientIp(req),
  });

  res.json({ test: updated });
});

export default router;
