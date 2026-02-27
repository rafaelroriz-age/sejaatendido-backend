import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { criarConsultaSchema } from '../validators/schemas.js';
import emailService from '../services/email.service.js';
import { enviarPushParaUsuario } from '../services/push.service.js';

const r = Router();

// =====================
// ROTAS AUTENTICADAS (PACIENTE)
// =====================

// Obter perfil do paciente logado
r.get('/me/perfil', authMiddleware, requireRole('PACIENTE'), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const paciente = await prisma.paciente.findUnique({
      where: { usuarioId: userId },
      include: {
        usuario: {
          select: { id: true, nome: true, email: true },
        },
      },
    });

    if (!paciente) {
      return res.status(404).json({ erro: 'Perfil de paciente não encontrado' });
    }

    res.json(paciente);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao buscar perfil' });
  }
});

// Criar consulta
r.post(
  '/consultas',
  authMiddleware,
  requireRole('PACIENTE'),
  validate(criarConsultaSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { medicoId, data, motivo } = req.body;

      const paciente = await prisma.paciente.findUnique({
        where: { usuarioId: userId },
        include: {
          usuario: { select: { id: true, nome: true, email: true } },
        },
      });

      if (!paciente) {
        return res.status(404).json({ erro: 'Paciente não encontrado' });
      }

      // Verificar se médico existe e está aprovado
      const medico = await prisma.medico.findUnique({
        where: { id: medicoId },
        include: { usuario: { select: { id: true, nome: true, email: true } } },
      });

      if (!medico || medico.status !== 'APROVADO') {
        return res.status(400).json({ erro: 'Médico não disponível' });
      }

      // Verificar se já existe consulta no mesmo horário
      const dataConsulta = new Date(data);
      const conflito = await prisma.consulta.findFirst({
        where: {
          medicoId,
          data: dataConsulta,
          status: { in: ['PENDENTE', 'ACEITA'] },
        },
      });

      if (conflito) {
        return res.status(400).json({ erro: 'Horário já ocupado' });
      }

      const consulta = await prisma.consulta.create({
        data: {
          pacienteId: paciente.id,
          medicoId,
          data: dataConsulta,
          motivo,
          status: 'PENDENTE',
        },
        include: {
          medico: {
            include: {
              usuario: {
                select: { id: true, nome: true, email: true },
              },
            },
          },
        },
      });

      // Emails (best-effort)
      try {
        const especialidade = medico.especialidades?.[0] || 'Consulta';
        await emailService.enviarConsultaAgendada(
          paciente.usuario.email,
          paciente.usuario.nome,
          medico.usuario.nome,
          especialidade,
          dataConsulta,
          motivo
        );
        await emailService.enviarNovaConsultaMedico(
          medico.usuario.email,
          medico.usuario.nome,
          paciente.usuario.nome,
          dataConsulta,
          motivo
        );
      } catch (e) {
        console.warn('Falha ao enviar emails da consulta:', e);
      }

      // Push para o médico (best-effort)
      try {
        await enviarPushParaUsuario({
          usuarioId: medico.usuario.id,
          titulo: 'Nova solicitação de consulta',
          corpo: `${paciente.usuario.nome} solicitou uma consulta`,
          data: { tipo: 'NOVA_CONSULTA', consultaId: consulta.id },
        });
      } catch (e) {
        console.warn('Falha ao enviar push para médico:', e);
      }

      res.status(201).json(consulta);
    } catch (e) {
      console.error(e);
      res.status(500).json({ erro: 'Erro ao criar consulta' });
    }
  }
);

// Listar consultas do paciente
r.get('/consultas', authMiddleware, requireRole('PACIENTE'), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { status } = req.query;

    const paciente = await prisma.paciente.findUnique({
      where: { usuarioId: userId },
    });

    if (!paciente) {
      return res.status(404).json({ erro: 'Paciente não encontrado' });
    }

    const consultas = await prisma.consulta.findMany({
      where: {
        pacienteId: paciente.id,
        ...(status && { status: status as any }),
      },
      include: {
        medico: {
          include: {
            usuario: {
              select: { id: true, nome: true, email: true },
            },
          },
        },
        pagamento: true,
      },
      orderBy: { data: 'desc' },
    });

    res.json(consultas);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao listar consultas' });
  }
});

// Buscar consulta específica
r.get('/consultas/:id', authMiddleware, requireRole('PACIENTE'), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const paciente = await prisma.paciente.findUnique({
      where: { usuarioId: userId },
    });

    if (!paciente) {
      return res.status(404).json({ erro: 'Paciente não encontrado' });
    }

    const consulta = await prisma.consulta.findUnique({
      where: { id },
      include: {
        medico: {
          include: {
            usuario: {
              select: { id: true, nome: true, email: true },
            },
          },
        },
        pagamento: true,
      },
    });

    if (!consulta || consulta.pacienteId !== paciente.id) {
      return res.status(404).json({ erro: 'Consulta não encontrada' });
    }

    res.json(consulta);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao buscar consulta' });
  }
});

// Cancelar consulta
r.delete('/consultas/:id', authMiddleware, requireRole('PACIENTE'), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const paciente = await prisma.paciente.findUnique({
      where: { usuarioId: userId },
    });

    if (!paciente) {
      return res.status(404).json({ erro: 'Paciente não encontrado' });
    }

    const consulta = await prisma.consulta.findUnique({
      where: { id },
      include: {
        medico: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
        paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
      },
    });

    if (!consulta || consulta.pacienteId !== paciente.id) {
      return res.status(403).json({ erro: 'Consulta não encontrada ou sem permissão' });
    }

    if (consulta.status === 'CONCLUIDA') {
      return res.status(400).json({ erro: 'Não é possível cancelar consulta concluída' });
    }

    // Verificar se pode cancelar (ex: mínimo 24h antes)
    const horasAntecedencia = (new Date(consulta.data).getTime() - Date.now()) / (1000 * 60 * 60);
    if (horasAntecedencia < 24 && consulta.status === 'ACEITA') {
      return res.status(400).json({
        erro: 'Cancelamento deve ser feito com no mínimo 24 horas de antecedência',
      });
    }

    const atualizada = await prisma.consulta.update({
      where: { id },
      data: { status: 'CANCELADA' },
    });

    // Notificações (best-effort)
    try {
      await emailService.enviarConsultaCancelada(
        consulta.paciente.usuario.email,
        consulta.paciente.usuario.nome,
        consulta.medico.usuario.nome,
        new Date(consulta.data)
      );
    } catch (e) {
      console.warn('Falha ao enviar email de cancelamento:', e);
    }

    try {
      await enviarPushParaUsuario({
        usuarioId: consulta.medico.usuario.id,
        titulo: 'Consulta cancelada',
        corpo: `${consulta.paciente.usuario.nome} cancelou a consulta`,
        data: { tipo: 'CONSULTA_CANCELADA', consultaId: consulta.id },
      });
    } catch (e) {
      console.warn('Falha ao enviar push de cancelamento:', e);
    }

    res.json(atualizada);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao cancelar consulta' });
  }
});

export default r;