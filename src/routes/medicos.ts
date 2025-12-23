import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { atualizarMedicoSchema, atualizarConsultaSchema } from '../validators/schemas';
import emailService from '../services/email.service';
import { enviarPushParaUsuario } from '../services/push.service';
import { gerarTokenEHash } from '../utils/secureTokens';
import { ENV } from '../env';

const r = Router();

// =====================
// ROTAS PÚBLICAS
// =====================

// Listar todos os médicos aprovados (público)
r.get('/', async (req: Request, res: Response) => {
  try {
    const { especialidade, nome } = req.query;

    const medicos = await prisma.medico.findMany({
      where: {
        aprovado: true,
        ...(especialidade && {
          especialidades: { has: especialidade as string },
        }),
        ...(nome && {
          usuario: { nome: { contains: nome as string, mode: 'insensitive' } },
        }),
      },
      include: {
        usuario: {
          select: { id: true, nome: true },
        },
      },
    });
    res.json(medicos);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao listar médicos' });
  }
});

// Buscar médico específico por ID
r.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const medico = await prisma.medico.findUnique({
      where: { id },
      include: {
        usuario: {
          // Evita expor email em rota pública
          select: { id: true, nome: true },
        },
      },
    });

    if (!medico) {
      return res.status(404).json({ erro: 'Médico não encontrado' });
    }

    res.json(medico);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao buscar médico' });
  }
});

// =====================
// ROTAS AUTENTICADAS (MÉDICO)
// =====================

// Obter perfil do médico logado
r.get('/me/perfil', authMiddleware, requireRole('MEDICO'), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const medico = await prisma.medico.findUnique({
      where: { usuarioId: userId },
      include: {
        usuario: {
          select: { id: true, nome: true, email: true },
        },
        documentos: true,
      },
    });

    if (!medico) {
      return res.status(404).json({ erro: 'Perfil de médico não encontrado' });
    }

    res.json(medico);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao buscar perfil' });
  }
});

// Atualizar perfil de médico (somente o próprio médico)
r.put(
  '/me/perfil',
  authMiddleware,
  requireRole('MEDICO'),
  validate(atualizarMedicoSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { crm, especialidades } = req.body;

      const medico = await prisma.medico.findUnique({
        where: { usuarioId: userId },
      });

      if (!medico) {
        return res.status(404).json({ erro: 'Médico não encontrado' });
      }

      const atualizado = await prisma.medico.update({
        where: { id: medico.id },
        data: {
          ...(crm && { crm }),
          ...(especialidades && { especialidades }),
        },
        include: {
          usuario: {
            select: { id: true, nome: true, email: true },
          },
        },
      });

      res.json(atualizado);
    } catch (e) {
      console.error(e);
      res.status(500).json({ erro: 'Erro ao atualizar perfil' });
    }
  }
);

// Listar consultas do médico logado
r.get('/me/consultas', authMiddleware, requireRole('MEDICO'), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { status } = req.query;

    const medico = await prisma.medico.findUnique({
      where: { usuarioId: userId },
    });

    if (!medico) {
      return res.status(404).json({ erro: 'Médico não encontrado' });
    }

    const consultas = await prisma.consulta.findMany({
      where: {
        medicoId: medico.id,
        ...(status && { status: status as any }),
      },
      include: {
        paciente: {
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

// Aceitar ou recusar consulta
r.patch(
  '/me/consultas/:consultaId',
  authMiddleware,
  requireRole('MEDICO'),
  validate(atualizarConsultaSchema),
  async (req: Request, res: Response) => {
    try {
      const userId = req.userId!;
      const { consultaId } = req.params;
      const { status, meetLink } = req.body;

      const medico = await prisma.medico.findUnique({
        where: { usuarioId: userId },
        include: { usuario: { select: { id: true, nome: true, email: true } } },
      });

      if (!medico) {
        return res.status(404).json({ erro: 'Médico não encontrado' });
      }

      const consulta = await prisma.consulta.findUnique({
        where: { id: consultaId },
        include: {
          paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
        },
      });

      if (!consulta || consulta.medicoId !== medico.id) {
        return res.status(403).json({ erro: 'Consulta não encontrada ou sem permissão' });
      }

      const now = new Date();
      const willAccept = status === 'ACEITA';
      const cancelData = willAccept
        ? (() => {
            const { token, tokenHash } = gerarTokenEHash();
            const expiraEm = new Date(now.getTime() + ENV.CANCEL_TOKEN_TTL_HORAS * 60 * 60 * 1000);
            return { token, tokenHash, expiraEm };
          })()
        : null;

      const atualizada = await prisma.consulta.update({
        where: { id: consultaId },
        data: {
          ...(status && { status }),
          ...(meetLink && { meetLink }),
          ...(cancelData && {
            cancelTokenHash: cancelData.tokenHash,
            cancelTokenExpiraEm: cancelData.expiraEm,
          }),
        },
        include: {
          paciente: {
            include: {
              usuario: {
                select: { id: true, nome: true, email: true },
              },
            },
          },
        },
      });

      // Notificações (best-effort)
      try {
        if (status === 'ACEITA') {
          const cancelarLink = cancelData
            ? `${ENV.BACKEND_URL}/emails/cancelar-consulta?token=${encodeURIComponent(cancelData.token)}`
            : undefined;

          await emailService.enviarConsultaConfirmada(
            atualizada.paciente.usuario.email,
            atualizada.paciente.usuario.nome,
            medico.usuario.nome,
            new Date(atualizada.data),
            atualizada.meetLink || meetLink,
            cancelarLink
          );

          await enviarPushParaUsuario({
            usuarioId: atualizada.paciente.usuario.id,
            titulo: 'Consulta confirmada',
            corpo: `Sua consulta com Dr(a). ${medico.usuario.nome} foi confirmada`,
            data: { tipo: 'CONSULTA_ACEITA', consultaId: atualizada.id },
          });
        }

        if (status === 'RECUSADA') {
          await emailService.enviarConsultaCancelada(
            atualizada.paciente.usuario.email,
            atualizada.paciente.usuario.nome,
            medico.usuario.nome,
            new Date(atualizada.data)
          );

          await enviarPushParaUsuario({
            usuarioId: atualizada.paciente.usuario.id,
            titulo: 'Consulta recusada',
            corpo: `Sua solicitação com Dr(a). ${medico.usuario.nome} foi recusada`,
            data: { tipo: 'CONSULTA_RECUSADA', consultaId: atualizada.id },
          });
        }
      } catch (e) {
        console.warn('Falha ao enviar notificações da consulta:', e);
      }

      res.json(atualizada);
    } catch (e) {
      console.error(e);
      res.status(500).json({ erro: 'Erro ao atualizar consulta' });
    }
  }
);

// Upload de documentos do médico
r.post('/me/documentos', authMiddleware, requireRole('MEDICO'), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { url, tipo } = req.body;

    if (!url || !tipo) {
      return res.status(400).json({ erro: 'URL e tipo do documento são obrigatórios' });
    }

    const medico = await prisma.medico.findUnique({
      where: { usuarioId: userId },
    });

    if (!medico) {
      return res.status(404).json({ erro: 'Médico não encontrado' });
    }

    const documento = await prisma.documento.create({
      data: {
        medicoId: medico.id,
        url,
        tipo,
      },
    });

    res.status(201).json(documento);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao salvar documento' });
  }
});

export default r;