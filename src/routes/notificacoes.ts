import { Router, Request, Response } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware';
import { prisma } from '../utils/prisma';
import { enviarPushParaUsuario } from '../services/push.service';

const r = Router();

// Todas as rotas requerem autenticação
r.use(authMiddleware);

// Registrar token do dispositivo (FCM)
r.post('/device-token', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { token, platform } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ erro: 'Token é obrigatório' });
    }

    const existente = await prisma.deviceToken.findUnique({ where: { token } });
    if (existente && existente.usuarioId !== userId) {
      return res.status(409).json({
        erro: 'Token já está registrado para outro usuário',
      });
    }

    const saved = await prisma.deviceToken.upsert({
      where: { token },
      update: { usuarioId: userId, platform: platform || null },
      create: { usuarioId: userId, token, platform: platform || null },
    });

    res.status(201).json(saved);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao registrar token' });
  }
});

// Remover token do dispositivo
r.delete('/device-token', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { token } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ erro: 'Token é obrigatório' });
    }

    await prisma.deviceToken.deleteMany({
      where: { usuarioId: userId, token },
    });

    res.json({ mensagem: 'Token removido' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao remover token' });
  }
});

// Enviar push de teste para o próprio usuário
r.post('/test', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { titulo, corpo } = req.body;

    const result = await enviarPushParaUsuario({
      usuarioId: userId,
      titulo: titulo || 'Teste',
      corpo: corpo || 'Notificação de teste',
    });

    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao enviar push' });
  }
});

export default r;
