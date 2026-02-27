import { Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import bcrypt from 'bcryptjs';
import { ENV } from '../env.js';
import emailService from '../services/email.service.js';
import { OAuth2Client } from 'google-auth-library';
import { gerarTokenEHash } from '../utils/secureTokens.js';
import {
  blocklistAccessToken,
  issueRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  signAccessToken,
} from '../utils/authTokens.js';
import jwt from 'jsonwebtoken';

const googleClient = ENV.GOOGLE_CLIENT_ID ? new OAuth2Client(ENV.GOOGLE_CLIENT_ID) : null;

export async function registro(req:Request, res:Response){
  try{
    const { nome, email, senha, tipo, crm } = req.body as {
      nome: string;
      email: string;
      senha: string;
      tipo: 'PACIENTE' | 'MEDICO';
      crm?: string;
    };
    const existe = await prisma.usuario.findUnique({ where:{ email } });
    if(existe) return res.status(400).json({ erro:'Email já cadastrado' });

    if (tipo === 'MEDICO') {
      const crmFinal = String(crm ?? '').trim().toUpperCase();
      if (!crmFinal) return res.status(400).json({ erro: 'CRM é obrigatório para médicos' });

      const crmEmUso = await prisma.medico.findUnique({ where: { crm: crmFinal } });
      if (crmEmUso) return res.status(400).json({ erro: 'CRM já cadastrado' });
    }

    const senhaHash = await bcrypt.hash(senha, 10);
    const user = await prisma.usuario.create({ data:{ nome, email, senhaHash, tipo } });
    if(tipo === 'MEDICO') {
      const crmFinal = String(crm ?? '').trim().toUpperCase();
      await prisma.medico.create({
        data:{
          usuarioId: user.id,
          crm: crmFinal,
          especialidades:[],
          status: 'PENDENTE',
          aprovado: false,
          diplomaUrl: null,
          motivoRejeicao: null,
        }
      });
    }
    if(tipo === 'PACIENTE') {
      await prisma.paciente.create({ data:{ usuarioId: user.id }});
    }

    // Enviar confirmação de email (best-effort)
    try {
      const { token, tokenHash } = gerarTokenEHash();
      const expiraEm = new Date(Date.now() + ENV.EMAIL_VERIFICACAO_TTL_HORAS * 60 * 60 * 1000);

      await prisma.usuario.update({
        where: { id: user.id },
        data: {
          emailVerificacaoTokenHash: tokenHash,
          emailVerificacaoExpiraEm: expiraEm,
          emailVerificacaoEnviadoEm: new Date(),
        },
      });

      await emailService.enviarConfirmacaoEmail(user.email, user.nome, token);
    } catch (e) {
      console.warn('Falha ao enviar confirmação de email:', e);
    }

    const access = signAccessToken({ userId: user.id, tipo: user.tipo });
    const refresh = await issueRefreshToken(user.id);

    res.json({
      id: user.id,
      token: access.token,
      accessToken: access.token,
      refreshToken: refresh.refreshToken,
      usuario: { id: user.id, nome: user.nome, email: user.email, tipo: user.tipo },
      ...(tipo === 'MEDICO'
        ? { mensagem: 'Cadastro realizado. Seu perfil será analisado por um administrador antes de liberar o acesso.' }
        : {}),
    });
  }catch(e){ console.error(e); res.status(500).json({ erro:'registro falhou' }); }
}

export async function login(req:Request, res:Response){
  try{
    const { email, senha } = req.body;
    const user = await prisma.usuario.findUnique({ where:{ email }});
    if(!user) return res.status(401).json({ erro:'Credenciais invalidas' });

    // Conta criada via Google (senhaHash vazio) não pode logar com senha
    if (!user.senhaHash) {
      return res.status(401).json({ erro: 'Conta sem senha. Use login com Google ou defina uma senha.' });
    }

    const ok = await bcrypt.compare(senha, user.senhaHash);
    if(!ok) return res.status(401).json({ erro:'Credenciais invalidas' });

    if (user.tipo === 'MEDICO') {
      const medico = await prisma.medico.findUnique({
        where: { usuarioId: user.id },
        select: { status: true, motivoRejeicao: true },
      });

      if (!medico) {
        return res.status(403).json({ erro: 'Perfil de médico não encontrado' });
      }

      if (medico.status !== 'APROVADO') {
        if (medico.status === 'REJEITADO') {
          return res.status(403).json({
            erro: 'Cadastro de médico rejeitado',
            motivo: medico.motivoRejeicao || undefined,
          });
        }

        return res.status(403).json({
          erro: 'Cadastro de médico pendente de aprovação',
        });
      }
    }

    const access = signAccessToken({ userId: user.id, tipo: user.tipo });
    const refresh = await issueRefreshToken(user.id);
    res.json({
      token: access.token,
      accessToken: access.token,
      refreshToken: refresh.refreshToken,
      usuario:{ id:user.id, nome:user.nome, email:user.email, tipo:user.tipo },
    });
  }catch(e){ console.error(e); res.status(500).json({ erro:'login falhou' }); }
}

// Google login: receive idToken from frontend (verify recommended)
export async function loginGoogle(req:Request, res:Response){
  try{
    const { idToken } = req.body;

    if (!googleClient) {
      return res.status(503).json({ erro: 'Google OAuth não configurado (GOOGLE_CLIENT_ID ausente)' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: ENV.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email = payload?.email;
    const nome = payload?.name || (email ? email.split('@')[0] : undefined);
    const emailVerificado = !!payload?.email_verified;

    if (!email || !nome) {
      return res.status(400).json({ erro: 'Token Google inválido' });
    }

    let user = await prisma.usuario.findUnique({ where:{ email } });
    if(!user){
      user = await prisma.usuario.create({ data:{ nome, email, senhaHash:'', tipo:'PACIENTE', emailConfirmado: emailVerificado }});
      await prisma.paciente.create({ data:{ usuarioId: user.id }});
    } else if (emailVerificado && !user.emailConfirmado) {
      await prisma.usuario.update({ where: { id: user.id }, data: { emailConfirmado: true } });
    }
    const access = signAccessToken({ userId: user.id, tipo: user.tipo });
    const refresh = await issueRefreshToken(user.id);
    res.json({
      token: access.token,
      accessToken: access.token,
      refreshToken: refresh.refreshToken,
      usuario:{ id:user.id, nome:user.nome, email:user.email, tipo:user.tipo },
    });
  }catch(e){ console.error(e); res.status(500).json({ erro:'google login falhou' }); }
}

export async function refreshToken(req: Request, res: Response) {
  try {
    const { refreshToken: rt } = req.body as { refreshToken?: string };
    if (!rt) return res.status(400).json({ erro: 'refreshToken é obrigatório' });

    const rotated = await rotateRefreshToken(rt);
    if (!rotated.ok) return res.status(rotated.status).json({ erro: rotated.erro });

    const usuario = await prisma.usuario.findUnique({ where: { id: rotated.usuarioId } });
    if (!usuario) return res.status(401).json({ erro: 'Usuário não encontrado' });

    const access = signAccessToken({ userId: usuario.id, tipo: usuario.tipo });
    res.json({
      token: access.token,
      accessToken: access.token,
      refreshToken: rotated.refreshToken,
    });
  } catch (e) {
    console.error(e);
    return res.status(400).json({ erro: 'Refresh token inválido' });
  }
}

export async function logout(req: Request, res: Response) {
  try {
    const { refreshToken: rt } = req.body as { refreshToken?: string };
    if (rt) {
      await revokeRefreshToken(rt);
    }

    // Opcional: blacklist do access token atual
    const authHeader = req.headers.authorization;
    if (authHeader?.toLowerCase().startsWith('bearer ')) {
      const token = authHeader.slice(7);
      const decoded = jwt.decode(token) as any;
      const jti = typeof decoded?.jti === 'string' ? decoded.jti : '';
      const sub = typeof decoded?.sub === 'string' ? decoded.sub : '';
      const exp = typeof decoded?.exp === 'number' ? decoded.exp : 0;

      if (jti && sub && exp) {
        const expiraEm = new Date(exp * 1000);
        await blocklistAccessToken({ jti, usuarioId: sub, expiraEm });
      }
    }

    return res.json({ mensagem: 'Logout realizado' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ erro: 'Erro ao fazer logout' });
  }
}
