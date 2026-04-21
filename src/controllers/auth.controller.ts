import { Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
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
import { logger, serializeError } from '../logger/winston.js';

const googleClient = ENV.GOOGLE_CLIENT_ID ? new OAuth2Client(ENV.GOOGLE_CLIENT_ID) : null;
const googleAudiences = [ENV.GOOGLE_CLIENT_ID, ENV.GOOGLE_ANDROID_CLIENT_ID, ENV.GOOGLE_IOS_CLIENT_ID].filter(Boolean);

// ─── Apple Sign In ──────────────────────────────────────────────────────────

interface AppleJWK {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface AppleTokenPayload {
  iss: string;
  aud: string | string[];
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  is_private_email?: boolean | string;
}

interface AppleServerNotificationPayload {
  iss?: string;
  aud?: string | string[];
  sub?: string;
  email?: string;
  is_private_email?: boolean | string;
  events?: Record<string, unknown>;
  event?: string;
}

// Cache Apple public keys for 1 hour to avoid hammering their endpoint
let _appleJwksCache: { keys: AppleJWK[]; fetchedAt: number } | null = null;
const APPLE_JWKS_TTL_MS = 60 * 60 * 1000;

async function fetchApplePublicKeys(): Promise<AppleJWK[]> {
  if (_appleJwksCache && Date.now() - _appleJwksCache.fetchedAt < APPLE_JWKS_TTL_MS) {
    return _appleJwksCache.keys;
  }
  const res = await fetch('https://appleid.apple.com/auth/keys');
  if (!res.ok) throw new Error(`Apple JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys: AppleJWK[] };
  _appleJwksCache = { keys: data.keys, fetchedAt: Date.now() };
  return data.keys;
}

function jwkToPem(jwk: AppleJWK): string {
  const input = { key: jwk, format: 'jwk' as const } as unknown as Parameters<typeof crypto.createPublicKey>[0];
  return crypto
    .createPublicKey(input)
    .export({ type: 'spki', format: 'pem' }) as string;
}

async function verifyAppleIdentityToken(identityToken: string): Promise<AppleTokenPayload> {
  const [rawHeader] = identityToken.split('.');
  const header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString('utf8')) as { kid?: string; alg?: string };

  const keys = await fetchApplePublicKeys();
  const matchingKey = keys.find((k) => k.kid === header.kid);
  if (!matchingKey) {
    // Key not in cache — invalidate cache and retry once
    _appleJwksCache = null;
    const freshKeys = await fetchApplePublicKeys();
    const retryKey = freshKeys.find((k) => k.kid === header.kid);
    if (!retryKey) throw new Error('Apple public key not found for kid: ' + header.kid);
    return verifyWithKey(identityToken, retryKey);
  }
  return verifyWithKey(identityToken, matchingKey);
}

async function verifyAppleSignedPayload(signedPayload: string): Promise<AppleServerNotificationPayload> {
  const [rawHeader] = signedPayload.split('.');
  const header = JSON.parse(Buffer.from(rawHeader, 'base64url').toString('utf8')) as { kid?: string };

  const keys = await fetchApplePublicKeys();
  const matchingKey = keys.find((k) => k.kid === header.kid);
  if (!matchingKey) {
    _appleJwksCache = null;
    const freshKeys = await fetchApplePublicKeys();
    const retryKey = freshKeys.find((k) => k.kid === header.kid);
    if (!retryKey) throw new Error('Apple public key not found for kid: ' + header.kid);
    return verifyAppleNotificationWithKey(signedPayload, retryKey);
  }

  return verifyAppleNotificationWithKey(signedPayload, matchingKey);
}

function verifyWithKey(identityToken: string, jwk: AppleJWK): AppleTokenPayload {
  const pem = jwkToPem(jwk);
  const verifyOptions: jwt.VerifyOptions = {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
  };
  // Only validate audience when APPLE_CLIENT_ID is configured
  if (ENV.APPLE_CLIENT_ID) {
    verifyOptions.audience = ENV.APPLE_CLIENT_ID;
  }
  return jwt.verify(identityToken, pem, verifyOptions) as unknown as AppleTokenPayload;
}

function verifyAppleNotificationWithKey(signedPayload: string, jwk: AppleJWK): AppleServerNotificationPayload {
  const pem = jwkToPem(jwk);
  const verifyOptions: jwt.VerifyOptions = {
    algorithms: ['RS256'],
    issuer: 'https://appleid.apple.com',
  };
  return jwt.verify(signedPayload, pem, verifyOptions) as unknown as AppleServerNotificationPayload;
}


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
      logger.warn('email_confirm_send_failed', { error: serializeError(e) });
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
  }catch(e){ logger.error('auth_register_failed', { error: serializeError(e) }); res.status(500).json({ erro:'registro falhou' }); }
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
  }catch(e){ logger.error('auth_login_failed', { error: serializeError(e) }); res.status(500).json({ erro:'login falhou' }); }
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
      audience: googleAudiences,
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
  }catch(e){ logger.error('auth_google_login_failed', { error: serializeError(e) }); res.status(500).json({ erro:'google login falhou' }); }
}

// Apple Sign In: receive identityToken (JWT) from iOS frontend
export async function loginApple(req: Request, res: Response) {
  try {
    const { identityToken, fullName, email: bodyEmail } = req.body as {
      identityToken: string;
      fullName?: { givenName?: string | null; familyName?: string | null };
      email?: string;
    };

    // 1. Verify the identity token against Apple's public keys
    let payload: AppleTokenPayload;
    try {
      payload = await verifyAppleIdentityToken(identityToken);
    } catch (err) {
      logger.warn('apple_token_verification_failed', { error: serializeError(err) });
      return res.status(401).json({ erro: 'identityToken inválido ou expirado' });
    }

    const appleUserId = payload.sub;
    // Apple sends email in the JWT on first sign-in only; subsequent calls omit it
    const tokenEmail = typeof payload.email === 'string' && payload.email.trim() ? payload.email.trim() : undefined;
    const email = tokenEmail ?? (typeof bodyEmail === 'string' && bodyEmail.trim() ? bodyEmail.trim() : undefined);
    const emailVerificado = payload.email_verified === true || payload.email_verified === 'true';
    const isPrivateRelay = typeof email === 'string' && email.endsWith('@privaterelay.appleid.com');

    // 2. Look up user by apple_user_id first (stable across sessions)
    let user = await prisma.usuario.findUnique({ where: { appleUserId } });

    if (!user) {
      // First sign-in: Apple must provide an email so we can create the account
      if (!email) {
        return res.status(400).json({
          erro: 'Email não fornecido. Verifique as permissões de acesso ao Apple Sign In.',
        });
      }

      // Resolve display name: prefer fullName from request, fall back to email prefix
      const givenName = fullName?.givenName?.trim() ?? '';
      const familyName = fullName?.familyName?.trim() ?? '';
      const nome =
        [givenName, familyName].filter(Boolean).join(' ') ||
        (isPrivateRelay ? 'Usuário Apple' : email.split('@')[0]);

      // Check if an account already exists with the same email (e.g. created via email/password)
      const existingByEmail = await prisma.usuario.findUnique({ where: { email } });
      if (existingByEmail) {
        // Link the Apple ID to the existing account
        user = await prisma.usuario.update({
          where: { id: existingByEmail.id },
          data: {
            appleUserId,
            ...(emailVerificado && !existingByEmail.emailConfirmado ? { emailConfirmado: true } : {}),
          },
        });
      } else {
        // Brand-new user — create as PACIENTE (Apple is a consumer-facing flow)
        user = await prisma.usuario.create({
          data: {
            nome,
            email,
            senhaHash: '',
            tipo: 'PACIENTE',
            appleUserId,
            emailConfirmado: emailVerificado || isPrivateRelay,
          },
        });
        await prisma.paciente.create({ data: { usuarioId: user.id } });
      }
    } else if (emailVerificado && !user.emailConfirmado) {
      // Subsequent login: update email confirmation if Apple now confirms it
      await prisma.usuario.update({ where: { id: user.id }, data: { emailConfirmado: true } });
    }

    const access = signAccessToken({ userId: user.id, tipo: user.tipo });
    const refresh = await issueRefreshToken(user.id);
    return res.json({
      token: access.token,
      accessToken: access.token,
      refreshToken: refresh.refreshToken,
      usuario: { id: user.id, nome: user.nome, email: user.email, tipo: user.tipo },
    });
  } catch (e) {
    logger.error('auth_apple_login_failed', { error: serializeError(e) });
    return res.status(500).json({ erro: 'apple login falhou' });
  }
}

export async function appleServerNotification(req: Request, res: Response) {
  try {
    const { signedPayload } = req.body as { signedPayload: string };

    let payload: AppleServerNotificationPayload;
    try {
      payload = await verifyAppleSignedPayload(signedPayload);
    } catch (err) {
      logger.warn('apple_server_notification_verification_failed', { error: serializeError(err) });
      return res.status(401).json({ erro: 'signedPayload inválido' });
    }

    const appleUserId = typeof payload.sub === 'string' ? payload.sub : '';
    const email = typeof payload.email === 'string' ? payload.email : undefined;
    const eventFromField = typeof payload.event === 'string' ? payload.event : undefined;
    const eventFromObject =
      payload.events && typeof payload.events['type'] === 'string'
        ? String(payload.events['type'])
        : undefined;
    const eventType = eventFromField ?? eventFromObject ?? 'unknown';

    const user = appleUserId
      ? await prisma.usuario.findUnique({ where: { appleUserId }, select: { id: true, email: true } })
      : null;

    // Endpoint intentionally acknowledges event even when no local user is found.
    logger.info('apple_server_notification_received', {
      eventType,
      appleUserId: appleUserId || undefined,
      email,
      usuarioId: user?.id,
      usuarioEmail: user?.email,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    logger.error('apple_server_notification_failed', { error: serializeError(e) });
    return res.status(500).json({ erro: 'Falha ao processar notificação Apple' });
  }
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
    logger.warn('auth_refresh_failed', { error: serializeError(e) });
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
    logger.error('auth_logout_failed', { error: serializeError(e) });
    return res.status(500).json({ erro: 'Erro ao fazer logout' });
  }
}
