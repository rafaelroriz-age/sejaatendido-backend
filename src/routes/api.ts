import { Router } from 'express';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware.js';
import { validate, validateRequest } from '../middlewares/validate.middleware.js';
import {
  atualizarAvaliacaoSchema,
  atualizarUsuarioSchema,
  chatMensagemApiSchema,
  chatIdParamSchema,
  consultaIdBodySchema,
  consultaLinkVideoSchema,
  consultaStatusSchema,
  idParamSchema,
  criarAvaliacaoSchema,
  criarConsultaSchema,
  listProfissionaisQuerySchema,
  profissionalIdParamSchema,
  userIdParamSchema,
  usuarioSearchSchema,
} from '../validators/schemas.js';
import { prisma } from '../utils/prisma.js';
import { chatService } from '../services/chat.service.js';
import { isMongoConnected } from '../utils/mongodb.js';

const api = Router();

// =====================
// AUTH (aliases)
// =====================
// Reusa o router existente /auth via mount no index.ts.

// =====================
// USUÁRIOS (24-endpoints spec)
// =====================
api.get('/usuarios/search', authMiddleware, async (req, res) => {
  const parsed = usuarioSearchSchema.safeParse({
    q: req.query.q,
    especialidade: req.query.especialidade,
  });
  if (!parsed.success) {
    return res.status(400).json({ erro: 'Dados inválidos', detalhes: parsed.error.issues });
  }

  const { q, especialidade } = parsed.data;

  const medicos = await prisma.medico.findMany({
    where: {
      status: 'APROVADO',
      ...(especialidade ? { especialidades: { has: especialidade } } : {}),
      usuario: { nome: { contains: q, mode: 'insensitive' } },
    },
    include: { usuario: { select: { id: true, nome: true } } },
    take: 50,
  });

  return res.json({ profissionais: medicos });
});

api.get('/usuarios/profissionais', async (req, res) => {
  const parsed = listProfissionaisQuerySchema.safeParse({
    especialidade: req.query.especialidade,
    nome: req.query.nome,
  });

  if (!parsed.success) {
    return res.status(400).json({ erro: 'Dados inválidos', detalhes: parsed.error.issues });
  }

  const { especialidade, nome } = parsed.data;
  const medicos = await prisma.medico.findMany({
    where: {
      status: 'APROVADO',
      ...(especialidade ? { especialidades: { has: especialidade } } : {}),
      ...(nome ? { usuario: { nome: { contains: nome, mode: 'insensitive' } } } : {}),
    },
    include: { usuario: { select: { id: true, nome: true } } },
    take: 100,
  });
  res.json(medicos);
});

api.get('/usuarios/:id', authMiddleware, validateRequest({ params: idParamSchema }), async (req, res) => {
  const targetId = String(req.params.id);
  const requesterId = req.userId!;

  if (requesterId !== targetId && req.userTipo !== 'ADMIN') {
    return res.status(403).json({ erro: 'Sem permissão' });
  }

  const usuario = await prisma.usuario.findUnique({
    where: { id: targetId },
    select: {
      id: true,
      nome: true,
      email: true,
      tipo: true,
      criadoEm: true,
      emailConfirmado: true,
      medico: { select: { id: true, crm: true, especialidades: true, aprovado: true, status: true, motivoRejeicao: true } },
      paciente: { select: { id: true } },
    },
  });

  if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });
  res.json(usuario);
});

api.put(
  '/usuarios/:id',
  authMiddleware,
  validateRequest({ params: idParamSchema }),
  validate(atualizarUsuarioSchema),
  async (req, res) => {
  const targetId = String(req.params.id);
  const requesterId = req.userId!;

  if (requesterId !== targetId && req.userTipo !== 'ADMIN') {
    return res.status(403).json({ erro: 'Sem permissão' });
  }

  const { nome, email } = req.body as { nome?: string; email?: string };

  if (email) {
    const emailEmUso = await prisma.usuario.findFirst({ where: { email, id: { not: targetId } } });
    if (emailEmUso) return res.status(400).json({ erro: 'Email já está em uso' });
  }

  const atualizado = await prisma.usuario.update({
    where: { id: targetId },
    data: {
      ...(typeof nome === 'string' && nome.trim() ? { nome: nome.trim() } : {}),
      ...(typeof email === 'string' && email.trim() ? { email: email.trim() } : {}),
    },
    select: { id: true, nome: true, email: true, tipo: true, criadoEm: true },
  });

  res.json(atualizado);
  }
);

api.delete('/usuarios/:id', authMiddleware, validateRequest({ params: idParamSchema }), async (req, res) => {
  const targetId = String(req.params.id);
  const requesterId = req.userId!;

  if (requesterId !== targetId && req.userTipo !== 'ADMIN') {
    return res.status(403).json({ erro: 'Sem permissão' });
  }

  // Reusa regras do endpoint /usuarios/me: checa consultas ativas
  const usuario = await prisma.usuario.findUnique({ where: { id: targetId }, include: { medico: true, paciente: true } });
  if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });

  if (usuario.medico) {
    const consultasAtivas = await prisma.consulta.count({
      where: { medicoId: usuario.medico.id, status: { in: ['PENDENTE', 'ACEITA'] } },
    });
    if (consultasAtivas > 0) {
      return res.status(400).json({ erro: 'Não é possível deletar conta com consultas ativas' });
    }
  }

  if (usuario.paciente) {
    const consultasAtivas = await prisma.consulta.count({
      where: { pacienteId: usuario.paciente.id, status: { in: ['PENDENTE', 'ACEITA'] } },
    });
    if (consultasAtivas > 0) {
      return res.status(400).json({ erro: 'Não é possível deletar conta com consultas ativas' });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (usuario.medico) {
      await tx.avaliacao.deleteMany({ where: { medicoId: usuario.medico.id } });
      await tx.documento.deleteMany({ where: { medicoId: usuario.medico.id } });
      await tx.consulta.deleteMany({ where: { medicoId: usuario.medico.id } });
      await tx.medico.delete({ where: { id: usuario.medico.id } });
    }
    if (usuario.paciente) {
      await tx.avaliacao.deleteMany({ where: { pacienteId: usuario.paciente.id } });
      await tx.consulta.deleteMany({ where: { pacienteId: usuario.paciente.id } });
      await tx.paciente.delete({ where: { id: usuario.paciente.id } });
    }
    await tx.usuario.delete({ where: { id: targetId } });
  });

  res.json({ mensagem: 'Usuário deletado com sucesso' });
});

// =====================
// CONSULTAS
// =====================
api.post('/consultas/agendar', authMiddleware, requireRole('PACIENTE'), validate(criarConsultaSchema), async (req, res) => {
  const userId = req.userId!;
  const { medicoId, data, motivo } = req.body as { medicoId: string; data: string; motivo: string };

  const paciente = await prisma.paciente.findUnique({ where: { usuarioId: userId } });
  if (!paciente) return res.status(404).json({ erro: 'Paciente não encontrado' });

  const medico = await prisma.medico.findUnique({ where: { id: medicoId } });
  if (!medico || medico.status !== 'APROVADO') return res.status(400).json({ erro: 'Médico não disponível' });

  const dataConsulta = new Date(data);
  const conflito = await prisma.consulta.findFirst({
    where: { medicoId, data: dataConsulta, status: { in: ['PENDENTE', 'ACEITA'] } },
  });
  if (conflito) return res.status(400).json({ erro: 'Horário já ocupado' });

  const consulta = await prisma.consulta.create({
    data: { pacienteId: paciente.id, medicoId, data: dataConsulta, motivo, status: 'PENDENTE' },
  });
  res.status(201).json(consulta);
});

api.get('/consultas/:id', authMiddleware, validateRequest({ params: idParamSchema }), async (req, res) => {
  const userId = req.userId!;
  const consulta = await prisma.consulta.findUnique({
    where: { id: String(req.params.id) },
    include: {
      medico: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
      paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
      pagamento: true,
      avaliacao: true,
    },
  });
  if (!consulta) return res.status(404).json({ erro: 'Consulta não encontrada' });

  const allowed =
    req.userTipo === 'ADMIN' ||
    consulta.medico.usuarioId === userId ||
    consulta.paciente.usuarioId === userId;
  if (!allowed) return res.status(403).json({ erro: 'Sem permissão' });

  res.json(consulta);
});

api.get('/consultas/usuario/:userId', authMiddleware, validateRequest({ params: userIdParamSchema }), async (req, res) => {
  const targetUserId = String(req.params.userId);
  const requesterId = req.userId!;

  if (targetUserId !== requesterId && req.userTipo !== 'ADMIN') {
    return res.status(403).json({ erro: 'Sem permissão' });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: targetUserId }, include: { medico: true, paciente: true } });
  if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });

  if (usuario.medico) {
    const consultas = await prisma.consulta.findMany({
      where: { medicoId: usuario.medico.id },
      include: { pagamento: true, avaliacao: true },
      orderBy: { data: 'desc' },
    });
    return res.json(consultas);
  }

  if (usuario.paciente) {
    const consultas = await prisma.consulta.findMany({
      where: { pacienteId: usuario.paciente.id },
      include: { pagamento: true, avaliacao: true },
      orderBy: { data: 'desc' },
    });
    return res.json(consultas);
  }

  return res.json([]);
});

api.put(
  '/consultas/:id/status',
  authMiddleware,
  requireRole('MEDICO', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  validate(consultaStatusSchema),
  async (req, res) => {
  const consultaId = String(req.params.id);
  const { status } = req.body as { status: any };

  const consulta = await prisma.consulta.findUnique({ where: { id: consultaId } });
  if (!consulta) return res.status(404).json({ erro: 'Consulta não encontrada' });

  if (req.userTipo !== 'ADMIN') {
    const medico = await prisma.medico.findUnique({ where: { usuarioId: req.userId! } });
    if (!medico || consulta.medicoId !== medico.id) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
  }

  const atualizada = await prisma.consulta.update({ where: { id: consultaId }, data: { status } });
  res.json(atualizada);
  }
);

api.post('/consultas/:id/cancelar', authMiddleware, validateRequest({ params: idParamSchema }), async (req, res) => {
  const consultaId = String(req.params.id);
  const userId = req.userId!;

  const consulta = await prisma.consulta.findUnique({
    where: { id: consultaId },
    include: {
      medico: { select: { usuarioId: true } },
      paciente: { select: { usuarioId: true } },
    },
  });

  if (!consulta) return res.status(404).json({ erro: 'Consulta não encontrada' });

  const allowed = req.userTipo === 'ADMIN' || consulta.medico.usuarioId === userId || consulta.paciente.usuarioId === userId;
  if (!allowed) return res.status(403).json({ erro: 'Sem permissão' });

  if (consulta.status === 'CONCLUIDA') return res.status(400).json({ erro: 'Não é possível cancelar consulta concluída' });

  const atualizada = await prisma.consulta.update({ where: { id: consultaId }, data: { status: 'CANCELADA' } });
  res.json({ mensagem: 'Consulta cancelada', consulta: atualizada });
});

api.post(
  '/consultas/:id/link-video',
  authMiddleware,
  requireRole('MEDICO', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  validate(consultaLinkVideoSchema),
  async (req, res) => {
  const consultaId = String(req.params.id);
  const { meetLink } = req.body as { meetLink: string };

  const consulta = await prisma.consulta.findUnique({ where: { id: consultaId } });
  if (!consulta) return res.status(404).json({ erro: 'Consulta não encontrada' });

  if (req.userTipo !== 'ADMIN') {
    const medico = await prisma.medico.findUnique({ where: { usuarioId: req.userId! } });
    if (!medico || consulta.medicoId !== medico.id) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
  }

  const atualizada = await prisma.consulta.update({ where: { id: consultaId }, data: { meetLink } });
  res.json(atualizada);
  }
);

// =====================
// AVALIAÇÕES
// =====================
api.post('/avaliacoes/criar', authMiddleware, requireRole('PACIENTE'), validate(criarAvaliacaoSchema), async (req, res) => {
  const userId = req.userId!;
  const { consultaId, nota, comentario } = req.body as { consultaId: string; nota: number; comentario?: string };

  const paciente = await prisma.paciente.findUnique({ where: { usuarioId: userId } });
  if (!paciente) return res.status(404).json({ erro: 'Paciente não encontrado' });

  const consulta = await prisma.consulta.findUnique({ where: { id: consultaId } });
  if (!consulta || consulta.pacienteId !== paciente.id) {
    return res.status(403).json({ erro: 'Consulta não encontrada ou sem permissão' });
  }

  if (consulta.status !== 'CONCLUIDA') {
    return res.status(400).json({ erro: 'Só é possível avaliar consultas concluídas' });
  }

  const avaliacao = await prisma.avaliacao.create({
    data: {
      consultaId,
      medicoId: consulta.medicoId,
      pacienteId: paciente.id,
      nota,
      comentario,
    },
  });

  res.status(201).json(avaliacao);
});

api.get('/avaliacoes/profissional/:profissionalId', validateRequest({ params: profissionalIdParamSchema }), async (req, res) => {
  const medicoId = String(req.params.profissionalId);
  const avaliacoes = await prisma.avaliacao.findMany({
    where: { medicoId },
    orderBy: { criadoEm: 'desc' },
    include: { paciente: { include: { usuario: { select: { id: true, nome: true } } } } },
  });
  res.json(avaliacoes);
});

api.put(
  '/avaliacoes/:id',
  authMiddleware,
  requireRole('PACIENTE', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  validate(atualizarAvaliacaoSchema),
  async (req, res) => {
  const avaliacaoId = String(req.params.id);
  const { nota, comentario } = req.body as { nota?: number; comentario?: string };

  const avaliacao = await prisma.avaliacao.findUnique({ where: { id: avaliacaoId } });
  if (!avaliacao) return res.status(404).json({ erro: 'Avaliação não encontrada' });

  if (req.userTipo !== 'ADMIN') {
    const paciente = await prisma.paciente.findUnique({ where: { usuarioId: req.userId! } });
    if (!paciente || avaliacao.pacienteId !== paciente.id) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
  }

  const atualizada = await prisma.avaliacao.update({
    where: { id: avaliacaoId },
    data: { ...(nota !== undefined ? { nota } : {}), ...(comentario !== undefined ? { comentario } : {}) },
  });

  res.json(atualizada);
  }
);

api.delete(
  '/avaliacoes/:id',
  authMiddleware,
  requireRole('PACIENTE', 'ADMIN'),
  validateRequest({ params: idParamSchema }),
  async (req, res) => {
  const avaliacaoId = String(req.params.id);
  const avaliacao = await prisma.avaliacao.findUnique({ where: { id: avaliacaoId } });
  if (!avaliacao) return res.status(404).json({ erro: 'Avaliação não encontrada' });

  if (req.userTipo !== 'ADMIN') {
    const paciente = await prisma.paciente.findUnique({ where: { usuarioId: req.userId! } });
    if (!paciente || avaliacao.pacienteId !== paciente.id) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }
  }

  await prisma.avaliacao.delete({ where: { id: avaliacaoId } });
  res.json({ mensagem: 'Avaliação deletada' });
  }
);

// =====================
// CHATS (Mongo; chatId = consultaId)
// =====================
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

api.post('/chats/iniciar', authMiddleware, validate(consultaIdBodySchema), async (req, res) => {
  const { consultaId } = req.body as { consultaId: string };

  const perm = await assertChatPermission({ appointmentId: consultaId, userId: req.userId!, userTipo: req.userTipo });
  if (!perm.ok) return res.status(perm.status).json({ erro: perm.erro });

  return res.json({ chatId: consultaId });
});

api.get('/chats/usuario/:userId', authMiddleware, async (req, res) => {
  const targetUserId = String(req.params.userId);
  if (targetUserId !== req.userId && req.userTipo !== 'ADMIN') {
    return res.status(403).json({ erro: 'Sem permissão' });
  }

  const usuario = await prisma.usuario.findUnique({ where: { id: targetUserId }, include: { medico: true, paciente: true } });
  if (!usuario) return res.status(404).json({ erro: 'Usuário não encontrado' });

  let consultas: any[] = [];
  if (usuario.medico) {
    consultas = await prisma.consulta.findMany({
      where: { medicoId: usuario.medico.id, status: { in: ['ACEITA', 'CONCLUIDA'] } },
      orderBy: { data: 'desc' },
    });
  } else if (usuario.paciente) {
    consultas = await prisma.consulta.findMany({
      where: { pacienteId: usuario.paciente.id, status: { in: ['ACEITA', 'CONCLUIDA'] } },
      orderBy: { data: 'desc' },
    });
  }

  return res.json({ chats: consultas.map((c) => ({ chatId: c.id, consultaId: c.id, data: c.data, status: c.status })) });
});

api.get('/chats/:chatId/mensagens', authMiddleware, validateRequest({ params: chatIdParamSchema }), async (req, res) => {
  if (!isMongoConnected()) {
    return res.status(503).json({ erro: 'Chat indisponível (MongoDB desconectado)' });
  }

  const chatId = String(req.params.chatId);
  const perm = await assertChatPermission({ appointmentId: chatId, userId: req.userId!, userTipo: req.userTipo });
  if (!perm.ok) return res.status(perm.status).json({ erro: perm.erro });

  const limitRaw = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
  const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Number(limitRaw))) : 50;

  const messages = await chatService.getAppointmentChat(chatId, limit);
  res.json(messages);
});

api.post(
  '/chats/:chatId/mensagens',
  authMiddleware,
  validateRequest({ params: chatIdParamSchema }),
  validate(chatMensagemApiSchema),
  async (req, res) => {
  if (!isMongoConnected()) {
    return res.status(503).json({ erro: 'Chat indisponível (MongoDB desconectado)' });
  }

  const chatId = String(req.params.chatId);
  const senderId = req.userId!;
  const { recipientId, message } = req.body as { recipientId: string; message: string };

  const perm = await assertChatPermission({ appointmentId: chatId, userId: senderId, userTipo: req.userTipo });
  if (!perm.ok) return res.status(perm.status).json({ erro: perm.erro });

  const validRecipients = [perm.medicoUsuarioId, perm.pacienteUsuarioId];
  if (!validRecipients.includes(recipientId) || recipientId === senderId) {
    return res.status(400).json({ erro: 'Destinatário inválido' });
  }

  const saved = await chatService.saveMessage({ appointmentId: chatId, senderId, recipientId, message });
  res.status(201).json(saved);
  }
);

api.put('/chats/:chatId/marcar-lidas', authMiddleware, validateRequest({ params: chatIdParamSchema }), async (req, res) => {
  // Não há read receipts no modelo atual; endpoint mantido como no-op compatível
  const chatId = String(req.params.chatId);
  const perm = await assertChatPermission({ appointmentId: chatId, userId: req.userId!, userTipo: req.userTipo });
  if (!perm.ok) return res.status(perm.status).json({ erro: perm.erro });
  res.json({ ok: true });
});

export default api;
