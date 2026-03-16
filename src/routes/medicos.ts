import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { atualizarMedicoSchema, atualizarConsultaSchema, dadosBancariosSchema } from '../validators/schemas.js';
import emailService from '../services/email.service.js';
import { enviarPushParaUsuario } from '../services/push.service.js';
import { gerarTokenEHash } from '../utils/secureTokens.js';
import { ENV } from '../env.js';
import { encrypt, decrypt } from '../services/crypto.service.js';

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
        status: 'APROVADO',
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

      if (crm && crm !== medico.crm) {
        const crmEmUso = await prisma.medico.findUnique({ where: { crm } });
        if (crmEmUso) {
          return res.status(400).json({ erro: 'CRM já está em uso' });
        }
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

// Placeholder: upload de diploma (não armazena arquivo)
r.post('/:id/diploma', authMiddleware, requireRole('MEDICO'), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { id } = req.params;

    const medico = await prisma.medico.findUnique({ where: { usuarioId: userId } });
    if (!medico) return res.status(404).json({ erro: 'Médico não encontrado' });
    if (medico.id !== id) return res.status(403).json({ erro: 'Sem permissão' });

    return res.status(200).json({ message: 'Upload de diploma ainda não implementado', url: null });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro ao processar upload de diploma' });
  }
});

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

// =====================
// DADOS BANCÁRIOS / PIX
// =====================

// Consultar dados bancários do médico logado
r.get('/me/dados-bancarios', authMiddleware, requireRole('MEDICO'), async (req: Request, res: Response) => {
  try {
    const medico = await prisma.medico.findUnique({
      where: { usuarioId: req.userId! },
      select: {
        tipoChavePix: true,
        valorChavePix: true,
        banco: true,
        agencia: true,
        conta: true,
        mpUserId: true,
        mpAccessTokenEncrypted: true,
      },
    });

    if (!medico) return res.status(404).json({ erro: 'Médico não encontrado' });

    res.json({
      tipoChavePix: medico.tipoChavePix,
      valorChavePix: medico.valorChavePix,
      banco: medico.banco,
      agencia: medico.agencia,
      conta: medico.conta,
      mpUserId: medico.mpUserId,
      mpAccessTokenConfigured: !!medico.mpAccessTokenEncrypted,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao buscar dados bancários' });
  }
});

// Salvar / atualizar dados bancários
r.put(
  '/me/dados-bancarios',
  authMiddleware,
  requireRole('MEDICO'),
  validate(dadosBancariosSchema),
  async (req: Request, res: Response) => {
    try {
      const medico = await prisma.medico.findUnique({ where: { usuarioId: req.userId! } });
      if (!medico) return res.status(404).json({ erro: 'Médico não encontrado' });

      const { tipoChavePix, valorChavePix, banco, agencia, conta, mercadopagoAccessToken, mercadopagoUserId } = req.body;

      let mpAccessTokenEncrypted: string | null = medico.mpAccessTokenEncrypted;
      if (mercadopagoAccessToken) {
        if (!ENV.ENCRYPTION_KEY) {
          return res.status(503).json({ erro: 'Criptografia não configurada (ENCRYPTION_KEY ausente)' });
        }
        mpAccessTokenEncrypted = encrypt(mercadopagoAccessToken);
      }

      const atualizado = await prisma.medico.update({
        where: { id: medico.id },
        data: {
          tipoChavePix,
          valorChavePix,
          banco: banco || null,
          agencia: agencia || null,
          conta: conta || null,
          mpAccessTokenEncrypted,
          mpUserId: mercadopagoUserId || medico.mpUserId,
        },
        select: {
          tipoChavePix: true,
          valorChavePix: true,
          banco: true,
          agencia: true,
          conta: true,
          mpUserId: true,
          mpAccessTokenEncrypted: true,
        },
      });

      res.json({
        tipoChavePix: atualizado.tipoChavePix,
        valorChavePix: atualizado.valorChavePix,
        banco: atualizado.banco,
        agencia: atualizado.agencia,
        conta: atualizado.conta,
        mpUserId: atualizado.mpUserId,
        mpAccessTokenConfigured: !!atualizado.mpAccessTokenEncrypted,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ erro: 'Erro ao salvar dados bancários' });
    }
  }
);

// =====================
// REPASSES DO MÉDICO
// =====================

// Listar repasses do médico logado
r.get('/me/repasses', authMiddleware, requireRole('MEDICO'), async (req: Request, res: Response) => {
  try {
    const medico = await prisma.medico.findUnique({ where: { usuarioId: req.userId! } });
    if (!medico) return res.status(404).json({ erro: 'Médico não encontrado' });

    const { status } = req.query;

    const repasses = await prisma.repasse.findMany({
      where: {
        medicoId: medico.id,
        ...(status && { status: status as any }),
      },
      include: {
        consulta: {
          select: {
            id: true,
            data: true,
            paciente: { include: { usuario: { select: { nome: true } } } },
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
    });

    const totalPendente = repasses.filter((r) => r.status === 'PENDENTE').reduce((acc, r) => acc + r.valorRepasse, 0);
    const totalProcessado = repasses.filter((r) => r.status === 'PROCESSADO').reduce((acc, r) => acc + r.valorRepasse, 0);

    res.json({
      repasses,
      resumo: {
        totalPendenteCentavos: totalPendente,
        totalProcessadoCentavos: totalProcessado,
        count: repasses.length,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao listar repasses' });
  }
});

// =====================
// ROTAS PÚBLICAS (DETALHE)
// =====================

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

    if (medico.status !== 'APROVADO') {
      return res.status(404).json({ erro: 'Médico não encontrado' });
    }

    res.json(medico);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao buscar médico' });
  }
});

export default r;