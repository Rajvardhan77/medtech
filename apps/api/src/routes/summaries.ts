import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate } from '../middleware/auth';
import { logAudit, extractClientIp } from '../middleware/audit';
import { generatePatientSummary } from '../services/summaryService';

const router = Router();

// Generate new plain-language summary
router.post('/patients/:patientId/summaries', authenticate, async (req: Request, res: Response) => {
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

  const { summaryText, citedFieldIds } = await generatePatientSummary(patientId);

  const summary = await prisma.aISummary.create({
    data: {
      patient_id: patientId,
      model_version: 'claude-3-5-sonnet-20241022',
      summary_text: summaryText,
      cited_field_ids: citedFieldIds,
      disclaimer_shown: true,
    },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'AISummary',
    entityId: summary.id,
    newValue: JSON.stringify({ summaryId: summary.id, citedCount: citedFieldIds.length }),
    ipAddress: extractClientIp(req),
  });

  res.status(201).json({ summary });
});

// Get patient summaries history
router.get('/patients/:patientId/summaries', authenticate, async (req: Request, res: Response) => {
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

  const summaries = await prisma.aISummary.findMany({
    where: { patient_id: patientId },
    orderBy: { created_at: 'desc' },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'READ',
    entityType: 'AISummary',
    entityId: patientId,
    ipAddress: extractClientIp(req),
  });

  res.json({ summaries });
});

export default router;
