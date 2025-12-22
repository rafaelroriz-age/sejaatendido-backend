import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { atualizarMedicoSchema, atualizarConsultaSchema } from '../validators/schemas';

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
          select: { id: true, nome: true, email: true },
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
          select: { id: true, nome: true, email: true },
        },
        consultas: {
          where: { status: { in: ['PENDENTE', 'ACEITA'] } },
          select: { id: true, data: true, status: true },
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
      });

      if (!medico) {
        return res.status(404).json({ erro: 'Médico não encontrado' });
      }

      const consulta = await prisma.consulta.findUnique({
        where: { id: consultaId },
      });

      if (!consulta || consulta.medicoId !== medico.id) {
        return res.status(403).json({ erro: 'Consulta não encontrada ou sem permissão' });
      }

      const atualizada = await prisma.consulta.update({
        where: { id: consultaId },
        data: {
          ...(status && { status }),
          ...(meetLink && { meetLink }),
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