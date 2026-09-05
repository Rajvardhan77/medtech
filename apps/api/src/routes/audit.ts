import { Router, Request, Response } from 'express';
import { prisma } from '../prisma';
import { authenticate, requireRole } from '../middleware/auth';

const router = Router();

// Query audit logs (Clinicians and Admins only)
router.get('/', authenticate, requireRole(['clinician', 'admin']), async (req: Request, res: Response) => {
  const { entity_type, entity_id, action, limit = '50', offset = '0' } = req.query;

  const whereClause: any = {};
  if (entity_type) whereClause.entity_type = String(entity_type);
  if (entity_id) whereClause.entity_id = String(entity_id);
  if (action) whereClause.action = String(action);

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      where: whereClause,
      orderBy: { timestamp: 'desc' },
      take: Math.min(parseInt(String(limit), 10), 200),
      skip: parseInt(String(offset), 10),
      include: {
        user: { select: { email: true, role: true } },
      },
    }),
    prisma.auditLog.count({ where: whereClause }),
  ]);

  res.json({
    total,
    logs,
  });
});

export default router;
