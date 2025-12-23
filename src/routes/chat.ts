import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { chatEnviarMensagemSchema } from '../validators/schemas.js';
import { chatService } from '../services/chat.service.js';
import { prisma } from '../utils/prisma.js';
import { isMongoConnected } from '../utils/mongodb.js';

const r = Router();

async function assertChatPermission(params: { appointmentId: string; userId: string; userTipo?: string }) {
  const consulta = await prisma.consulta.findUnique({
    where: { id: params.appointmentId },
    select: {
      id: true,
      medico: { select: { usuarioId: true } },
      paciente: { select: { usuarioId: true } },
    },
  });

  if (!consulta) {
    return { ok: false as const, status: 404 as const, erro: 'Consulta não encontrada' };
  }

  if (params.userTipo === 'ADMIN') {
    return { ok: true as const, medicoUsuarioId: consulta.medico.usuarioId, pacienteUsuarioId: consulta.paciente.usuarioId };
  }

  const allowed = params.userId === consulta.medico.usuarioId || params.userId === consulta.paciente.usuarioId;
  if (!allowed) {
    return { ok: false as const, status: 403 as const, erro: 'Sem permissão' };
  }

  return { ok: true as const, medicoUsuarioId: consulta.medico.usuarioId, pacienteUsuarioId: consulta.paciente.usuarioId };
}

// POST: Enviar mensagem
r.post('/messages', authMiddleware, validate(chatEnviarMensagemSchema), async (req, res, next) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ erro: 'Chat indisponível (MongoDB desconectado)' });
    }

    const senderId = req.userId;
    if (!senderId) {
      return res.status(401).json({ erro: 'Não autenticado' });
    }

    const { appointmentId, recipientId, message } = req.body as {
      appointmentId: string;
      recipientId: string;
      message: string;
    };

    const perm = await assertChatPermission({
      appointmentId,
      userId: senderId,
      userTipo: req.userTipo,
    });

    if (!perm.ok) {
      return res.status(perm.status).json({ erro: perm.erro });
    }

    // Enforce recipient is the other participant
    const validRecipients = [perm.medicoUsuarioId, perm.pacienteUsuarioId];
    if (!validRecipients.includes(recipientId) || recipientId === senderId) {
      return res.status(400).json({ erro: 'Destinatário inválido' });
    }

    const saved = await chatService.saveMessage({
      appointmentId,
      senderId,
      recipientId,
      message,
    });

    return res.status(201).json(saved);
  } catch (error) {
    next(error);
  }
});

// GET: Histórico do chat
r.get('/messages/:appointmentId', authMiddleware, async (req, res, next) => {
  try {
    if (!isMongoConnected()) {
      return res.status(503).json({ erro: 'Chat indisponível (MongoDB desconectado)' });
    }

    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ erro: 'Não autenticado' });
    }

    const { appointmentId } = req.params;

    const perm = await assertChatPermission({
      appointmentId,
      userId,
      userTipo: req.userTipo,
    });

    if (!perm.ok) {
      return res.status(perm.status).json({ erro: perm.erro });
    }

    const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Number(limitRaw))) : 50;

    const messages = await chatService.getAppointmentChat(appointmentId, limit);
    return res.json(messages);
  } catch (error) {
    next(error);
  }
});

export default r;
