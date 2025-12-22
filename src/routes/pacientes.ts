import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { criarConsultaSchema } from '../validators/schemas';

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
      });

      if (!paciente) {
        return res.status(404).json({ erro: 'Paciente não encontrado' });
      }

      // Verificar se médico existe e está aprovado
      const medico = await prisma.medico.findUnique({
        where: { id: medicoId },
      });

      if (!medico || !medico.aprovado) {
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

    res.json(atualizada);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao cancelar consulta' });
  }
});

export default r;