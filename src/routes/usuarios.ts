import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware } from '../middlewares/auth.middleware';
import { validate } from '../middlewares/validate.middleware';
import { atualizarUsuarioSchema, alterarSenhaSchema } from '../validators/schemas';
import bcrypt from 'bcryptjs';

const r = Router();

// Todas as rotas requerem autenticação
r.use(authMiddleware);

// =====================
// PERFIL DO USUÁRIO LOGADO
// =====================

// Obter dados do usuário logado
r.get('/me', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nome: true,
        email: true,
        tipo: true,
        criadoEm: true,
        medico: {
          select: {
            id: true,
            crm: true,
            especialidades: true,
            aprovado: true,
          },
        },
        paciente: {
          select: {
            id: true,
          },
        },
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

// Atualizar dados do usuário logado
r.put('/me', validate(atualizarUsuarioSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { nome, email } = req.body;

    // Verificar se email já está em uso por outro usuário
    if (email) {
      const emailEmUso = await prisma.usuario.findFirst({
        where: {
          email,
          id: { not: userId },
        },
      });

      if (emailEmUso) {
        return res.status(400).json({ erro: 'Email já está em uso' });
      }
    }

    const atualizado = await prisma.usuario.update({
      where: { id: userId },
      data: {
        ...(nome && { nome }),
        ...(email && { email }),
      },
      select: {
        id: true,
        nome: true,
        email: true,
        tipo: true,
        criadoEm: true,
      },
    });

    res.json(atualizado);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao atualizar usuário' });
  }
});

// Alterar senha
r.put('/me/senha', validate(alterarSenhaSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { senhaAtual, novaSenha } = req.body;

    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
    });

    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    // Verificar senha atual (se não for login via Google)
    if (usuario.senhaHash) {
      const senhaCorreta = await bcrypt.compare(senhaAtual, usuario.senhaHash);
      if (!senhaCorreta) {
        return res.status(400).json({ erro: 'Senha atual incorreta' });
      }
    }

    // Gerar hash da nova senha
    const novaSenhaHash = await bcrypt.hash(novaSenha, 10);

    await prisma.usuario.update({
      where: { id: userId },
      data: { senhaHash: novaSenhaHash },
    });

    res.json({ mensagem: 'Senha alterada com sucesso' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao alterar senha' });
  }
});

// Deletar própria conta
r.delete('/me', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
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
          erro: 'Não é possível deletar conta com consultas ativas',
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
          erro: 'Não é possível deletar conta com consultas ativas',
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
      await tx.usuario.delete({ where: { id: userId } });
    });

    res.json({ mensagem: 'Conta deletada com sucesso' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao deletar conta' });
  }
});

export default r;
