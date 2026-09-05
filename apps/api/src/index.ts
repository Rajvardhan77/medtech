import { app } from './app';
import { config } from './config';
import { prisma } from './prisma';

const server = app.listen(config.PORT, () => {
  console.log(`[MedLens API] Server running on http://localhost:${config.PORT} in ${config.NODE_ENV} mode`);
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
