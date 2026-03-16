import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware.js';

const r = Router();

// =====================
// ADMIN: LISTAR REPASSES
// =====================
r.get('/', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { status, medicoId } = req.query;

    const repasses = await prisma.repasse.findMany({
      where: {
        ...(status && { status: status as any }),
        ...(medicoId && { medicoId: String(medicoId) }),
      },
      include: {
        consulta: {
          select: {
            id: true,
            data: true,
            paciente: { include: { usuario: { select: { nome: true } } } },
          },
        },
        medico: {
          select: {
            id: true,
            crm: true,
            tipoChavePix: true,
            valorChavePix: true,
            usuario: { select: { nome: true, email: true } },
          },
        },
      },
      orderBy: { criadoEm: 'desc' },
    });

    res.json(repasses);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao listar repasses' });
  }
});

// =====================
// ADMIN: MARCAR REPASSE COMO PROCESSADO
// =====================
r.patch('/:id/processar', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const repasse = await prisma.repasse.findUnique({ where: { id } });
    if (!repasse) return res.status(404).json({ erro: 'Repasse não encontrado' });

    if (repasse.status === 'PROCESSADO') {
      return res.status(400).json({ erro: 'Repasse já foi processado' });
    }

    const atualizado = await prisma.repasse.update({
      where: { id },
      data: {
        status: 'PROCESSADO',
        dataRepasse: new Date(),
      },
    });

    res.json(atualizado);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao processar repasse' });
  }
});

// =====================
// ADMIN: MARCAR REPASSE COMO FALHOU
// =====================
r.patch('/:id/falhou', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const repasse = await prisma.repasse.findUnique({ where: { id } });
    if (!repasse) return res.status(404).json({ erro: 'Repasse não encontrado' });

    if (repasse.status === 'PROCESSADO') {
      return res.status(400).json({ erro: 'Repasse já foi processado e não pode ser marcado como falhou' });
    }

    const atualizado = await prisma.repasse.update({
      where: { id },
      data: { status: 'FALHOU' },
    });

    res.json(atualizado);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao atualizar repasse' });
  }
});

export default r;
