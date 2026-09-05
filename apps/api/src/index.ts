import { app } from './app';
import { config } from './config';
import { prisma } from './prisma';

const port = Number(process.env.PORT) || config.PORT || 4000;

const server = app.listen(port, '0.0.0.0', () => {
  console.log(`[MedLens API] Server running on port ${port} in ${config.NODE_ENV} mode`);
});

const gracefulShutdown = async (signal: string) => {
  console.log(`\n[MedLens API] Received ${signal}. Gracefully shutting down...`);
  server.close(async () => {
    await prisma.$disconnect();
    console.log('[MedLens API] Disconnected from database. Server closed.');
    process.exit(0);
  });
};

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
