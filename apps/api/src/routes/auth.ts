import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRegisterSchema, UserLoginSchema } from '@medlens/shared-types';
import { prisma } from '../prisma';
import { config } from '../config';
import { validateBody } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { logAudit, extractClientIp } from '../middleware/audit';

const router = Router();

router.post('/register', validateBody(UserRegisterSchema), async (req: Request, res: Response) => {
  const { email, password, role } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return res.status(409).json({ error: 'User with this email already exists' });
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);

  const user = await prisma.user.create({
    data: {
      email,
      password_hash: passwordHash,
      role,
    },
    select: {
      id: true,
      email: true,
      role: true,
      created_at: true,
      updated_at: true,
    },
  });

  await logAudit({
    userId: user.id,
    action: 'CREATE',
    entityType: 'User',
    entityId: user.id,
    newValue: JSON.stringify({ email: user.email, role: user.role }),
    ipAddress: extractClientIp(req),
  });

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, config.JWT_SECRET, {
    expiresIn: '7d',
  });

  res.status(201).json({ user, token });
});

router.post('/login', validateBody(UserLoginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, config.JWT_SECRET, {
    expiresIn: '7d',
  });

  await logAudit({
    userId: user.id,
    action: 'READ',
    entityType: 'UserSession',
    entityId: user.id,
    ipAddress: extractClientIp(req),
  });

  res.json({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      created_at: user.created_at,
      updated_at: user.updated_at,
    },
    token,
  });
});

router.get('/me', authenticate, async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      role: true,
      created_at: true,
      updated_at: true,
      patient_profile: true,
    },
  });

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({ user });
});

export default router;
