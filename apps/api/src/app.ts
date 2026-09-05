import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import authRouter from './routes/auth';
import patientsRouter from './routes/patients';
import clinicalRouter from './routes/clinical';
import documentsRouter from './routes/documents';
import testsRouter from './routes/tests';
import conflictsRouter from './routes/conflicts';
import summariesRouter from './routes/summaries';
import auditRouter from './routes/audit';
import consentRouter from './routes/consent';
import { errorHandler } from './middleware/errorHandler';

export const app = express();

// Looser global rate limiter
const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

// Strict limiter for authentication and expensive AI endpoints
const strictLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 5, // limit each IP to 5 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded: maximum 5 requests per minute allowed for this endpoint.' },
});

app.use(
  cors({
    origin: config.FRONTEND_URL || '*',
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply global rate limiting to all /api routes
app.use('/api', globalLimiter);

// Health Check (exempt or uses global)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'medlens-api',
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

// Apply strict rate limiting to auth and AI endpoints
app.use('/api/auth', strictLimiter, authRouter);
app.use('/api/documents/:id/process', strictLimiter);
app.use('/api/patients/:patientId/summaries', strictLimiter);

// Mount Remaining Routes
app.use('/api/patients', patientsRouter);
app.use('/api/clinical', clinicalRouter);
app.use('/api', documentsRouter);
app.use('/api', testsRouter);
app.use('/api', conflictsRouter);
app.use('/api', summariesRouter);
app.use('/api', consentRouter);
app.use('/api/audit-logs', auditRouter);

// Central Error Handler
app.use(errorHandler);
