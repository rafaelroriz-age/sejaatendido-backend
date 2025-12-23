import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware.js';
import emailService from '../services/email.service.js';
import { validate } from '../middlewares/validate.middleware.js';
import { adminAtualizarUsuarioSchema, adminCriarUsuarioSchema } from '../validators/schemas.js';
import bcrypt from 'bcryptjs';

const r = Router();

// Todas as rotas requerem role ADMIN
r.use(authMiddleware, requireRole('ADMIN'));

// =====================
// GESTÃO DE MÉDICOS
// =====================

// Listar médicos pendentes de aprovação
r.get('/medicos/pendentes', async (req: Request, res: Response) => {
  try {
    const pendentes = await prisma.medico.findMany({
      where: { aprovado: false },
      include: {
        usuario: {
          select: { id: true, nome: true, email: true },
        },
        documentos: true,
      },
    });
    res.json(pendentes);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao listar médicos pendentes' });
  }
});

// Listar todos os médicos
r.get('/medicos', async (req: Request, res: Response) => {
  try {
    const medicos = await prisma.medico.findMany({
      include: {
        usuario: {
          select: { id: true, nome: true, email: true },
        },
        documentos: true,
      },
    });
    res.json(medicos);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao listar médicos' });
  }
});

// Aprovar médico
r.post('/medicos/:id/aprovar', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const medico = await prisma.medico.update({
      where: { id },
      data: { aprovado: true },
      include: {
        usuario: {
          select: { id: true, nome: true, email: true },
        },
      },
    });

    // Email (best-effort)
    try {
      await emailService.enviarMedicoAprovado(medico.usuario.email, medico.usuario.nome);
    } catch (e) {
      console.warn('Falha ao enviar email de médico aprovado:', e);
    }

    res.json({ mensagem: 'Médico aprovado com sucesso', medico });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao aprovar médico' });
  }
});

// Recusar médico
r.post('/medicos/:id/recusar', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Buscar médico e usuário relacionado
    const medico = await prisma.medico.findUnique({
      where: { id },
      include: { usuario: true },
    });

    if (!medico) {
      return res.status(404).json({ erro: 'Médico não encontrado' });
    }

    // Deletar documentos, médico e usuário
    await prisma.$transaction([
      prisma.documento.deleteMany({ where: { medicoId: id } }),
      prisma.medico.delete({ where: { id } }),
      prisma.usuario.delete({ where: { id: medico.usuarioId } }),
    ]);

    res.json({ mensagem: 'Médico recusado e removido do sistema' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao recusar médico' });
  }
});

// =====================
// GESTÃO DE CONSULTAS
// =====================

// Listar todas as consultas
r.get('/consultas', async (req: Request, res: Response) => {
  try {
    const { status, dataInicio, dataFim } = req.query;

    const consultas = await prisma.consulta.findMany({
      where: {
        ...(status && { status: status as any }),
        ...(dataInicio &&
          dataFim && {
            data: {
              gte: new Date(dataInicio as string),
              lte: new Date(dataFim as string),
            },
          }),
      },
      include: {
        medico: {
          include: {
            usuario: {
              select: { id: true, nome: true, email: true },
            },
          },
        },
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
      take: 100,
    });
    res.json(consultas);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao listar consultas' });
  }
});

// =====================
// GESTÃO DE USUÁRIOS
// =====================

// Listar todos os usuários
r.get('/usuarios', async (req: Request, res: Response) => {
  try {
    const { tipo } = req.query;

    const usuarios = await prisma.usuario.findMany({
      where: {
        ...(tipo && { tipo: tipo as any }),
      },
      select: {
        id: true,
        nome: true,
        email: true,
        tipo: true,
        criadoEm: true,
      },
      orderBy: { criadoEm: 'desc' },
    });
    res.json(usuarios);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao listar usuários' });
  }
});

// Criar usuário (cadastro manual pelo ADMIN)
r.post('/usuarios', validate(adminCriarUsuarioSchema), async (req: Request, res: Response) => {
  try {
    const { nome, email, senha, tipo, crm, especialidades } = req.body;

    const existe = await prisma.usuario.findUnique({ where: { email } });
    if (existe) return res.status(400).json({ erro: 'Email já cadastrado' });

    const senhaHash = await bcrypt.hash(senha, 10);

    const usuario = await prisma.usuario.create({
      data: { nome, email, senhaHash, tipo },
      select: { id: true, nome: true, email: true, tipo: true, criadoEm: true },
    });

    if (tipo === 'MEDICO') {
      await prisma.medico.create({
        data: {
          usuarioId: usuario.id,
          crm: crm || '',
          especialidades: especialidades || [],
        },
      });
    }

    if (tipo === 'PACIENTE') {
      await prisma.paciente.create({ data: { usuarioId: usuario.id } });
    }

    res.status(201).json(usuario);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao criar usuário' });
  }
});

// Atualizar usuário (nome/email) - não altera tipo (evita inconsistências)
r.put('/usuarios/:id', validate(adminAtualizarUsuarioSchema), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { nome, email } = req.body;

    if (!nome && !email) {
      return res.status(400).json({ erro: 'Nada para atualizar' });
    }

    if (email) {
      const emailEmUso = await prisma.usuario.findFirst({
        where: { email, id: { not: id } },
      });
      if (emailEmUso) return res.status(400).json({ erro: 'Email já está em uso' });
    }

    const atualizado = await prisma.usuario.update({
      where: { id },
      data: {
        ...(nome && { nome }),
        ...(email && { email }),
      },
      select: { id: true, nome: true, email: true, tipo: true, criadoEm: true },
    });

    res.json(atualizado);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao atualizar usuário' });
  }
});

// Buscar usuário específico
r.get('/usuarios/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const usuario = await prisma.usuario.findUnique({
      where: { id },
      select: {
        id: true,
        nome: true,
        email: true,
        tipo: true,
        criadoEm: true,
        medico: true,
        paciente: true,
      },
    });

    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    res.json(usuario);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao buscar usuário' });
  }
});

// Deletar usuário
r.delete('/usuarios/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const usuario = await prisma.usuario.findUnique({
      where: { id },
      include: { medico: true, paciente: true },
    });

    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    // Verificar se tem consultas ativas
    if (usuario.medico) {
      const consultasAtivas = await prisma.consulta.count({
        where: {
          medicoId: usuario.medico.id,
          status: { in: ['PENDENTE', 'ACEITA'] },
        },
      });
      if (consultasAtivas > 0) {
        return res.status(400).json({
          erro: 'Não é possível deletar médico com consultas ativas',
        });
      }
    }

    if (usuario.paciente) {
      const consultasAtivas = await prisma.consulta.count({
        where: {
          pacienteId: usuario.paciente.id,
          status: { in: ['PENDENTE', 'ACEITA'] },
        },
      });
      if (consultasAtivas > 0) {
        return res.status(400).json({
          erro: 'Não é possível deletar paciente com consultas ativas',
        });
      }
    }

    // Deletar em cascata
    await prisma.$transaction(async (tx) => {
      if (usuario.medico) {
        await tx.documento.deleteMany({ where: { medicoId: usuario.medico.id } });
        await tx.consulta.deleteMany({ where: { medicoId: usuario.medico.id } });
        await tx.medico.delete({ where: { id: usuario.medico.id } });
      }
      if (usuario.paciente) {
        await tx.consulta.deleteMany({ where: { pacienteId: usuario.paciente.id } });
        await tx.paciente.delete({ where: { id: usuario.paciente.id } });
      }
      await tx.usuario.delete({ where: { id } });
    });

    res.json({ mensagem: 'Usuário deletado com sucesso' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao deletar usuário' });
  }
});

// =====================
// DASHBOARD / ESTATÍSTICAS
// =====================

r.get('/dashboard', async (req: Request, res: Response) => {
  try {
    const [totalUsuarios, totalMedicos, medicosAprovados, totalPacientes, totalConsultas, consultasPendentes, consultasConcluidas, receitaTotal] =
      await Promise.all([
        prisma.usuario.count(),
        prisma.medico.count(),
        prisma.medico.count({ where: { aprovado: true } }),
        prisma.paciente.count(),
        prisma.consulta.count(),
        prisma.consulta.count({ where: { status: 'PENDENTE' } }),
        prisma.consulta.count({ where: { status: 'CONCLUIDA' } }),
        prisma.pagamento.aggregate({
          where: { status: 'PAGO' },
          _sum: { valorCentavos: true },
        }),
      ]);

    res.json({
      usuarios: {
        total: totalUsuarios,
        medicos: totalMedicos,
        medicosAprovados,
        medicosPendentes: totalMedicos - medicosAprovados,
        pacientes: totalPacientes,
      },
      consultas: {
        total: totalConsultas,
        pendentes: consultasPendentes,
        concluidas: consultasConcluidas,
      },
      financeiro: {
        receitaTotalCentavos: receitaTotal._sum.valorCentavos || 0,
        receitaTotalReais: ((receitaTotal._sum.valorCentavos || 0) / 100).toFixed(2),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao carregar dashboard' });
  }
});

export default r;