import { Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { ENV } from '../env.js';
import emailService from '../services/email.service.js';
import { OAuth2Client } from 'google-auth-library';
import { gerarTokenEHash } from '../utils/secureTokens.js';

function gerarToken(id:string, tipo:string){ return jwt.sign({ id, tipo }, ENV.JWT_SEGREDO, { expiresIn: '15d' }); }

const googleClient = ENV.GOOGLE_CLIENT_ID ? new OAuth2Client(ENV.GOOGLE_CLIENT_ID) : null;

export async function registro(req:Request, res:Response){
  try{
    const { nome, email, senha, tipo } = req.body;
    const existe = await prisma.usuario.findUnique({ where:{ email } });
    if(existe) return res.status(400).json({ erro:'Email já cadastrado' });
    const senhaHash = await bcrypt.hash(senha, 10);
    const user = await prisma.usuario.create({ data:{ nome, email, senhaHash, tipo } });
    if(tipo === 'MEDICO') {
      await prisma.medico.create({ data:{ usuarioId: user.id, crm:'', especialidades:[] }});
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

    res.json({ id: user.id });
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
    const token = gerarToken(user.id, user.tipo);
    res.json({ token, usuario:{ id:user.id, nome:user.nome, email:user.email, tipo:user.tipo } });
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
    const token = gerarToken(user.id, user.tipo);
    res.json({ token, usuario:{ id:user.id, nome:user.nome, email:user.email, tipo:user.tipo }});
  }catch(e){ console.error(e); res.status(500).json({ erro:'google login falhou' }); }
}
