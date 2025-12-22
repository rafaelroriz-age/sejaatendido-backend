import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ENV } from '../env';
import emailService from '../services/email.service';

const r = Router();

// =====================
// SOLICITAR CONFIRMAÇÃO DE EMAIL
// =====================
r.post('/confirmar-email/enviar', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const usuario = await prisma.usuario.findUnique({
      where: { id: userId },
    });

    if (!usuario) {
      return res.status(404).json({ erro: 'Usuário não encontrado' });
    }

    // Gerar token de confirmação (válido por 24h)
    const token = jwt.sign({ id: usuario.id, tipo: 'confirmacao-email' }, ENV.JWT_SEGREDO, {
      expiresIn: '24h',
    });

    await emailService.enviarConfirmacaoEmail(usuario.email, usuario.nome, token);

    res.json({ mensagem: 'Email de confirmação enviado' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao enviar email de confirmação' });
  }
});

// =====================
// CONFIRMAR EMAIL
// =====================
r.post('/confirmar-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ erro: 'Token não fornecido' });
    }

    const decoded = jwt.verify(token, ENV.JWT_SEGREDO) as any;

    if (decoded.tipo !== 'confirmacao-email') {
      return res.status(400).json({ erro: 'Token inválido' });
    }

    // Aqui você poderia marcar o email como confirmado
    // Por enquanto apenas retornamos sucesso
    res.json({ mensagem: 'Email confirmado com sucesso' });
  } catch (e) {
    console.error(e);
    res.status(400).json({ erro: 'Token inválido ou expirado' });
  }
});

// =====================
// SOLICITAR RECUPERAÇÃO DE SENHA
// =====================
r.post('/recuperar-senha', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ erro: 'Email é obrigatório' });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { email },
    });

    // Sempre retornar sucesso para não revelar se o email existe
    if (!usuario) {
      return res.json({ mensagem: 'Se o email existir, você receberá instruções para redefinir sua senha' });
    }

    // Gerar token de recuperação (válido por 1h)
    const token = jwt.sign({ id: usuario.id, tipo: 'recuperar-senha' }, ENV.JWT_SEGREDO, {
      expiresIn: '1h',
    });

    await emailService.enviarRecuperarSenha(usuario.email, usuario.nome, token);

    res.json({ mensagem: 'Se o email existir, você receberá instruções para redefinir sua senha' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao processar solicitação' });
  }
});

// =====================
// RESETAR SENHA
// =====================
r.post('/resetar-senha', async (req: Request, res: Response) => {
  try {
    const { token, novaSenha } = req.body;

    if (!token || !novaSenha) {
      return res.status(400).json({ erro: 'Token e nova senha são obrigatórios' });
    }

    if (novaSenha.length < 6) {
      return res.status(400).json({ erro: 'Senha deve ter no mínimo 6 caracteres' });
    }

    const decoded = jwt.verify(token, ENV.JWT_SEGREDO) as any;

    if (decoded.tipo !== 'recuperar-senha') {
      return res.status(400).json({ erro: 'Token inválido' });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);

    await prisma.usuario.update({
      where: { id: decoded.id },
      data: { senhaHash },
    });

    res.json({ mensagem: 'Senha redefinida com sucesso' });
  } catch (e) {
    console.error(e);
    res.status(400).json({ erro: 'Token inválido ou expirado' });
  }
});

// =====================
// ENVIAR EMAIL MANUAL (ADMIN)
// =====================
r.post('/enviar', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { destinatario, assunto, corpo } = req.body;

    if (!destinatario || !assunto || !corpo) {
      return res.status(400).json({ erro: 'Destinatário, assunto e corpo são obrigatórios' });
    }

    const enviado = await emailService.enviarEmail({
      to: destinatario,
      subject: assunto,
      html: corpo,
    });

    if (!enviado) {
      return res.status(500).json({ erro: 'Erro ao enviar email. Verifique a configuração SMTP.' });
    }

    res.json({ mensagem: 'Email enviado com sucesso' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao enviar email' });
  }
});

export default r;
