import { Router, Request, Response } from 'express';
import { UpdateConflictFlagStatusSchema } from '@medlens/shared-types';
import { prisma } from '../prisma';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { logAudit, extractClientIp } from '../middleware/audit';
import { detectRuleBasedConflicts, detectAIConflicts } from '../services/conflictService';

const router = Router();

// List conflict flags for patient
router.get('/patients/:patientId/conflicts', authenticate, async (req: Request, res: Response) => {
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

  const conflicts = await prisma.conflictFlag.findMany({
    where: { patient_id: patientId },
    orderBy: { created_at: 'desc' },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'READ',
    entityType: 'ConflictFlag',
    entityId: patientId,
    ipAddress: extractClientIp(req),
  });

  res.json({ conflicts });
});

// Trigger conflict detection for patient (Rules + AI)
router.post('/patients/:patientId/conflicts/detect', authenticate, async (req: Request, res: Response) => {
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

  // 1. Run deterministic rule-based conflict checks
  const ruleConflicts = await detectRuleBasedConflicts(patientId);

  // 2. Run AI-assisted conflict checks (if configured)
  const aiConflicts = await detectAIConflicts(patientId);

  const createdFlags = [];

  for (const rc of ruleConflicts) {
    const flag = await prisma.conflictFlag.create({
      data: {
        patient_id: patientId,
        type: rc.type,
        description: rc.description,
        related_record_ids: rc.relatedRecordIds,
        detected_by: 'rule',
        status: 'open',
      },
    });
    createdFlags.push(flag);
  }

  for (const ac of aiConflicts) {
    const flag = await prisma.conflictFlag.create({
      data: {
        patient_id: patientId,
        type: 'value_mismatch',
        description: ac.description,
        related_record_ids: [],
        detected_by: 'ai',
        status: 'open',
      },
    });
    createdFlags.push(flag);
  }

  await logAudit({
    userId: req.user!.id,
    action: 'CREATE',
    entityType: 'ConflictDetectionRun',
    entityId: patientId,
    newValue: JSON.stringify({ detectedCount: createdFlags.length }),
    ipAddress: extractClientIp(req),
  });

  res.json({
    message: `Conflict detection complete: ${createdFlags.length} flag(s) identified.`,
    conflicts: createdFlags,
  });
});

// Update conflict status (e.g., acknowledge or resolve)
router.patch('/conflicts/:id/status', authenticate, validateBody(UpdateConflictFlagStatusSchema), async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;

  const existing = await prisma.conflictFlag.findUnique({
    where: { id },
    include: { patient: true },
  });

  if (!existing || !existing.patient || existing.patient.deleted_at) {
    return res.status(404).json({ error: 'Conflict flag not found' });
  }

  if (req.user!.role === 'patient' && existing.patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
  }

  const updated = await prisma.conflictFlag.update({
    where: { id },
    data: { status },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'ConflictFlag',
    entityId: id,
    oldValue: JSON.stringify({ status: existing.status }),
    newValue: JSON.stringify({ status: updated.status }),
    ipAddress: extractClientIp(req),
  });

  res.json({ conflict: updated });
});

export default router;
