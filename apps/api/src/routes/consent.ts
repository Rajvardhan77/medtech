import { Router, Request, Response } from 'express';
import { CreateConsentRecordSchema, ConsentTypeEnum } from '@medlens/shared-types';
import { prisma } from '../prisma';
import { authenticate } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { logAudit, extractClientIp } from '../middleware/audit';

const router = Router();

// Grant or renew patient consent
router.post(
  '/patients/:patientId/consent',
  authenticate,
  validateBody(CreateConsentRecordSchema),
  async (req: Request, res: Response) => {
    const { patientId } = req.params;
    const { consent_type } = req.body;

    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
    });

    if (!patient || patient.deleted_at) {
      return res.status(404).json({ error: 'Patient record not found' });
    }

    if (req.user!.role === 'patient' && patient.user_id !== req.user!.id) {
      return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
    }

    // Check if there is already an active consent for this type
    const existingActive = await prisma.consentRecord.findFirst({
      where: {
        patient_id: patientId,
        consent_type,
        revoked_at: null,
      },
    });

    if (existingActive) {
      return res.status(200).json({ consent: existingActive });
    }

    const consent = await prisma.consentRecord.create({
      data: {
        patient_id: patientId,
        consent_type,
        granted_at: new Date(),
      },
    });

    await logAudit({
      userId: req.user!.id,
      action: 'CREATE',
      entityType: 'ConsentRecord',
      entityId: consent.id,
      newValue: JSON.stringify({ consent_type: consent.consent_type, granted_at: consent.granted_at }),
      ipAddress: extractClientIp(req),
    });

    res.status(201).json({ consent });
  }
);

// List patient consent records
router.get('/patients/:patientId/consent', authenticate, async (req: Request, res: Response) => {
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

  const consents = await prisma.consentRecord.findMany({
    where: { patient_id: patientId },
    orderBy: { granted_at: 'desc' },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'READ',
    entityType: 'ConsentRecord',
    entityId: patientId,
    ipAddress: extractClientIp(req),
  });

  res.json({ consents });
});

// Revoke patient consent
router.post('/patients/:patientId/consent/:consentType/revoke', authenticate, async (req: Request, res: Response) => {
  const { patientId, consentType } = req.params;

  const validTypes = ConsentTypeEnum.options as readonly string[];
  if (!validTypes.includes(consentType)) {
    return res.status(400).json({
      error: `Invalid consent type: ${consentType}. Must be one of: ${validTypes.join(', ')}`,
    });
  }

  const patient = await prisma.patient.findUnique({
    where: { id: patientId },
  });

  if (!patient || patient.deleted_at) {
    return res.status(404).json({ error: 'Patient record not found' });
  }

  if (req.user!.role === 'patient' && patient.user_id !== req.user!.id) {
    return res.status(403).json({ error: 'Forbidden: Access restricted to patient owner' });
  }

  const activeConsent = await prisma.consentRecord.findFirst({
    where: {
      patient_id: patientId,
      consent_type: consentType,
      revoked_at: null,
    },
  });

  if (!activeConsent) {
    return res.status(404).json({ error: `No active consent found for type '${consentType}' to revoke` });
  }

  const updated = await prisma.consentRecord.update({
    where: { id: activeConsent.id },
    data: { revoked_at: new Date() },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'UPDATE',
    entityType: 'ConsentRecord',
    entityId: updated.id,
    oldValue: JSON.stringify({ revoked_at: null }),
    newValue: JSON.stringify({ revoked_at: updated.revoked_at }),
    ipAddress: extractClientIp(req),
  });

  res.json({ consent: updated });
});

export default router;
