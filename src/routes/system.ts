import { Router } from 'express';
import { prisma } from '../utils/prisma.js';
import { ENV } from '../env.js';
import { chatService } from '../services/chat.service.js';

const r = Router();

r.get('/status', async (req, res) => {
  try {
    const dbStart = Date.now();
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - dbStart;

    res.json({
      status: 'online',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: true,
        latency: `${dbLatency}ms`,
      },
      memory: {
        used: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`,
        total: `${Math.round(process.memoryUsage().heapTotal / 1024 / 1024)}MB`,
      },
      environment: ENV.NODE_ENV,
    });
  } catch {
    res.status(500).json({
      status: 'error',
      error: 'Database connection failed',
    });
  }
});

export default r;

r.post('/chat-cleanup', async (req, res) => {
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  if (!ENV.CRON_SECRET || secret !== ENV.CRON_SECRET) {
    return res.status(401).json({ erro: 'Não autorizado' });
  }
  const deletadas = await chatService.deleteExpired();
  res.json({ ok: true, deletadas });
});
