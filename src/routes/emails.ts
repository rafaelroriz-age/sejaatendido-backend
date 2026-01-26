import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ENV } from '../env.js';
import emailService from '../services/email.service.js';
import { enviarPushParaUsuario } from '../services/push.service.js';
import { run15MinReminders, runDailyReminders, runRatingEmails, runAutoConcludeConsultations } from '../jobs/email.jobs.js';
import { gerarTokenEHash, sha256Hex } from '../utils/secureTokens.js';
import { recuperarSenhaSchema, resetarSenhaSchema } from '../validators/schemas.js';

const r = Router();

function cronOrAdminGuard(req: Request, res: Response, next: any) {
  const secret = req.header('x-cron-secret');
  if (ENV.CRON_SECRET && secret === ENV.CRON_SECRET) return next();
  return authMiddleware(req as any, res as any, () => requireRole('ADMIN')(req as any, res as any, next));
}

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

async function cancelarConsultaPorToken(token: string) {
  const tokenHash = sha256Hex(token);
  const now = new Date();

  const consulta = await prisma.consulta.findFirst({
    where: {
      cancelTokenHash: tokenHash,
      cancelTokenExpiraEm: { gt: now },
    },
    include: {
      medico: { include: { usuario: { select: { id: true, nome: true } } } },
      paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
    },
  });

  if (!consulta) {
    return { ok: false as const, status: 400 as const, erro: 'Token inválido ou expirado' };
  }

  if (consulta.status === 'CONCLUIDA') {
    return { ok: false as const, status: 400 as const, erro: 'Não é possível cancelar consulta concluída' };
  }

  // Mantém a mesma regra já aplicada no cancelamento autenticado
  const horasAntecedencia = (new Date(consulta.data).getTime() - Date.now()) / (1000 * 60 * 60);
  if (horasAntecedencia < 24 && consulta.status === 'ACEITA') {
    return {
      ok: false as const,
      status: 400 as const,
      erro: 'Cancelamento deve ser feito com no mínimo 24 horas de antecedência',
    };
  }

  const atualizada = await prisma.consulta.update({
    where: { id: consulta.id },
    data: {
      status: 'CANCELADA',
      cancelTokenHash: null,
      cancelTokenExpiraEm: null,
    },
  });

  // Notificações (best-effort)
  try {
    await emailService.enviarConsultaCancelada(
      consulta.paciente.usuario.email,
      consulta.paciente.usuario.nome,
      consulta.medico.usuario.nome,
      new Date(consulta.data)
    );
  } catch {
    // best-effort
  }

  try {
    await enviarPushParaUsuario({
      usuarioId: consulta.medico.usuario.id,
      titulo: 'Consulta cancelada',
      corpo: `${consulta.paciente.usuario.nome} cancelou a consulta`,
      data: { tipo: 'CONSULTA_CANCELADA', consultaId: consulta.id },
    });
  } catch {
    // best-effort
  }

  return { ok: true as const, status: 200 as const, consulta: atualizada };
}

async function confirmarEmailPorToken(token: string) {
  const now = new Date();
  const tokenHash = sha256Hex(String(token));

  const usuario = await prisma.usuario.findFirst({
    where: {
      emailVerificacaoTokenHash: tokenHash,
      emailVerificacaoExpiraEm: { gt: now },
    },
    select: { id: true, emailConfirmado: true },
  });

  if (usuario) {
    if (usuario.emailConfirmado) return { ok: true as const, already: true as const };

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        emailConfirmado: true,
        emailVerificacaoTokenHash: null,
        emailVerificacaoExpiraEm: null,
      },
    });

    return { ok: true as const, already: false as const };
  }

  // Compat: tokens antigos (JWT)
  const decoded = jwt.verify(String(token), ENV.JWT_SEGREDO) as any;
  if (decoded.tipo !== 'confirmacao-email') {
    return { ok: false as const, erro: 'Token inválido' };
  }

  await prisma.usuario.update({
    where: { id: decoded.id },
    data: {
      emailConfirmado: true,
      emailVerificacaoTokenHash: null,
      emailVerificacaoExpiraEm: null,
    },
  });

  return { ok: true as const, already: false as const };
}

// =====================
// JOB: LEMBRETES DE CONSULTA (CRON)
// =====================
// Proteção: header x-cron-secret = ENV.CRON_SECRET OU usuário ADMIN autenticado
r.post(
  '/jobs/lembretes-consultas',
  cronOrAdminGuard,
  async (req: Request, res: Response) => {
    try {
      const result = await runDailyReminders();
      res.json({
        ...result,
        // compat com payload antigo
        consultas: result.consultasProcessadas,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ erro: 'Erro ao enviar lembretes' });
    }
  }
);

// =====================
// JOB: LEMBRETE 15 MIN (CRON)
// =====================
r.post('/jobs/lembretes-15m', cronOrAdminGuard, async (req: Request, res: Response) => {
  try {
    const result = await run15MinReminders();
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao enviar lembretes 15m' });
  }
});

// =====================
// JOB: EMAIL DE AVALIAÇÃO (CRON)
// =====================
r.post('/jobs/avaliacao', cronOrAdminGuard, async (req: Request, res: Response) => {
  try {
    const result = await runRatingEmails();
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao enviar emails de avaliação' });
  }
});

// =====================
// JOB: CONCLUIR CONSULTAS (CRON)
// =====================
r.post('/jobs/concluir-consultas', cronOrAdminGuard, async (req: Request, res: Response) => {
  try {
    const result = await runAutoConcludeConsultations();
    res.json(result);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao concluir consultas' });
  }
});

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

    if (usuario.emailConfirmado) {
      return res.json({ mensagem: 'Email já está confirmado' });
    }

    // Anti-abuso: não reenviar com muita frequência
    if (usuario.emailVerificacaoEnviadoEm) {
      const deltaMs = Date.now() - new Date(usuario.emailVerificacaoEnviadoEm).getTime();
      if (deltaMs < 2 * 60 * 1000) {
        return res.status(429).json({ erro: 'Aguarde um pouco antes de solicitar outro email' });
      }
    }

    const { token, tokenHash } = gerarTokenEHash();
    const expiraEm = addHours(new Date(), ENV.EMAIL_VERIFICACAO_TTL_HORAS);

    await prisma.usuario.update({
      where: { id: usuario.id },
      data: {
        emailVerificacaoTokenHash: tokenHash,
        emailVerificacaoExpiraEm: expiraEm,
        emailVerificacaoEnviadoEm: new Date(),
      },
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

    const result = await confirmarEmailPorToken(String(token));
    if (!result.ok) return res.status(400).json({ erro: result.erro || 'Token inválido ou expirado' });

    return res.json({ mensagem: result.already ? 'Email já está confirmado' : 'Email confirmado com sucesso' });
  } catch (e) {
    console.error(e);
    res.status(400).json({ erro: 'Token inválido ou expirado' });
  }
});

r.get('/confirmar-email', async (req: Request, res: Response) => {
  try {
    const token = String(req.query?.token || '');
    if (!token) return res.status(400).send('<h3>Token não fornecido</h3>');

    const result = await confirmarEmailPorToken(token);
    if (!result.ok) return res.status(400).send(`<h3>${result.erro || 'Token inválido ou expirado'}</h3>`);

    return res.status(200).send(`<h3>${result.already ? 'Email já está confirmado.' : 'Email confirmado com sucesso.'}</h3>`);
  } catch (e) {
    console.error(e);
    res.status(400).send('<h3>Token inválido ou expirado</h3>');
  }
});

// =====================
// CANCELAR CONSULTA POR TOKEN (LINK)
// =====================
r.post('/cancelar-consulta', async (req: Request, res: Response) => {
  try {
    const token = String(req.body?.token || '');
    if (!token) return res.status(400).json({ erro: 'Token não fornecido' });

    const result = await cancelarConsultaPorToken(token);
    if (!result.ok) return res.status(result.status).json({ erro: result.erro });

    res.json({ mensagem: 'Consulta cancelada com sucesso', consulta: result.consulta });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao cancelar consulta' });
  }
});

r.get('/cancelar-consulta', async (req: Request, res: Response) => {
  try {
    const token = String(req.query?.token || '');
    if (!token) return res.status(400).send('<h3>Token não fornecido</h3>');

    const result = await cancelarConsultaPorToken(token);
    if (!result.ok) return res.status(result.status).send(`<h3>${result.erro}</h3>`);

    res.status(200).send('<h3>Consulta cancelada com sucesso.</h3>');
  } catch (e) {
    console.error(e);
    res.status(500).send('<h3>Erro ao cancelar consulta</h3>');
  }
});

// =====================
// REEMITIR LINK DE CANCELAMENTO (PACIENTE)
// =====================
r.post('/cancelar-consulta/enviar', authMiddleware, requireRole('PACIENTE'), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const consultaId = String(req.body?.consultaId || '');
    if (!consultaId) return res.status(400).json({ erro: 'consultaId é obrigatório' });

    const paciente = await prisma.paciente.findUnique({ where: { usuarioId: userId } });
    if (!paciente) return res.status(404).json({ erro: 'Paciente não encontrado' });

    const consulta = await prisma.consulta.findUnique({
      where: { id: consultaId },
      include: {
        medico: { include: { usuario: { select: { nome: true } } } },
        paciente: { include: { usuario: { select: { nome: true, email: true } } } },
      },
    });

    if (!consulta || consulta.pacienteId !== paciente.id) {
      return res.status(403).json({ erro: 'Consulta não encontrada ou sem permissão' });
    }

    if (consulta.status === 'CONCLUIDA') {
      return res.status(400).json({ erro: 'Não é possível cancelar consulta concluída' });
    }
    if (consulta.status === 'CANCELADA') {
      return res.status(400).json({ erro: 'Consulta já está cancelada' });
    }

    // Sempre reemite token (não dá pra recuperar o token a partir do hash).
    // Isso invalida links anteriores por segurança.
    const { token, tokenHash } = gerarTokenEHash();
    const expiraEm = addHours(new Date(), ENV.CANCEL_TOKEN_TTL_HORAS);

    await prisma.consulta.update({
      where: { id: consulta.id },
      data: { cancelTokenHash: tokenHash, cancelTokenExpiraEm: expiraEm },
    });

    const cancelarLink = `${ENV.BACKEND_URL}/emails/cancelar-consulta?token=${encodeURIComponent(token)}`;

    await emailService.enviarLinkCancelamentoConsulta(
      consulta.paciente.usuario.email,
      consulta.paciente.usuario.nome,
      consulta.medico.usuario.nome,
      new Date(consulta.data),
      cancelarLink
    );

    res.json({ mensagem: 'Link de cancelamento enviado por email' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao enviar link de cancelamento' });
  }
});

// =====================
// SOLICITAR RECUPERAÇÃO DE SENHA
// =====================
r.post('/recuperar-senha', async (req: Request, res: Response) => {
  try {
    const { email } = await recuperarSenhaSchema.parseAsync(req.body);

    const usuario = await prisma.usuario.findUnique({ where: { email } });

    // Sempre retornar sucesso para não revelar se o email existe
    if (!usuario) {
      return res.json({ mensagem: 'Se o email existir, você receberá instruções para redefinir sua senha' });
    }

    // Emite token aleatório (one-time) armazenado como hash no banco
    // (mantém a URL com ?token=... como já usado pelo frontend)
    const { token, tokenHash } = gerarTokenEHash();
    const expiraEm = addHours(new Date(), ENV.PASSWORD_RESET_TTL_HORAS);

    // Revoga tokens anteriores ainda válidos (um token ativo por vez)
    await prisma.passwordResetToken.updateMany({
      where: { usuarioId: usuario.id, usadoEm: null, expiraEm: { gt: new Date() } },
      data: { usadoEm: new Date() },
    });

    await prisma.passwordResetToken.create({
      data: {
        usuarioId: usuario.id,
        tokenHash,
        expiraEm,
      },
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
    const { token, novaSenha } = await resetarSenhaSchema.parseAsync(req.body);
    const now = new Date();

    // 1) Fluxo novo (DB token)
    const tokenHash = sha256Hex(token);
    const prt = await prisma.passwordResetToken.findFirst({
      where: { tokenHash, usadoEm: null, expiraEm: { gt: now } },
      select: { id: true, usuarioId: true },
    });

    if (prt) {
      const senhaHash = await bcrypt.hash(novaSenha, 10);

      await prisma.$transaction([
        prisma.usuario.update({ where: { id: prt.usuarioId }, data: { senhaHash } }),
        prisma.passwordResetToken.update({ where: { id: prt.id }, data: { usadoEm: now } }),
        // Revoga refresh tokens para forçar re-login
        prisma.refreshToken.updateMany({
          where: { usuarioId: prt.usuarioId, revogadoEm: null },
          data: { revogadoEm: now },
        }),
      ]);

      return res.json({ mensagem: 'Senha redefinida com sucesso' });
    }

    // 2) Compat: tokens antigos (JWT)
    const decoded = jwt.verify(token, ENV.JWT_SEGREDO) as any;
    if (decoded.tipo !== 'recuperar-senha') {
      return res.status(400).json({ erro: 'Token inválido' });
    }

    const senhaHash = await bcrypt.hash(novaSenha, 10);
    await prisma.$transaction([
      prisma.usuario.update({ where: { id: decoded.id }, data: { senhaHash } }),
      prisma.refreshToken.updateMany({ where: { usuarioId: decoded.id, revogadoEm: null }, data: { revogadoEm: now } }),
    ]);

    return res.json({ mensagem: 'Senha redefinida com sucesso' });
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
