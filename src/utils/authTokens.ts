import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { ENV } from '../env.js';
import { prisma } from './prisma.js';
import { sha256Hex } from './secureTokens.js';

export type AccessTokenPayload = {
  sub: string;
  tipo: string;
  jti: string;
};

export function signAccessToken(params: { userId: string; tipo: string }) {
  const jti = crypto.randomUUID();
  const expiresInSeconds = ENV.JWT_ACCESS_TOKEN_MINUTOS * 60;
  const token = jwt.sign({ sub: params.userId, tipo: params.tipo, jti } satisfies AccessTokenPayload, ENV.JWT_SEGREDO, {
    expiresIn: expiresInSeconds,
  });

  return { token, jti, expiresInMinutes: ENV.JWT_ACCESS_TOKEN_MINUTOS };
}

export function verifyAccessToken(token: string) {
  const decoded = jwt.verify(token, ENV.JWT_SEGREDO) as any;
  const payload: AccessTokenPayload = {
    sub: String(decoded.sub ?? ''),
    tipo: String(decoded.tipo ?? ''),
    jti: String(decoded.jti ?? ''),
  };
  if (!payload.sub || !payload.tipo || !payload.jti) {
    throw new Error('Token inválido');
  }
  return payload;
}

export async function blocklistAccessToken(params: { jti: string; usuarioId: string; expiraEm: Date }) {
  // Upsert: caso logout seja chamado duas vezes
  await prisma.accessTokenBlocklist.upsert({
    where: { jti: params.jti },
    create: { jti: params.jti, usuarioId: params.usuarioId, expiraEm: params.expiraEm },
    update: { usuarioId: params.usuarioId, expiraEm: params.expiraEm },
  });
}

export async function isAccessTokenBlocked(jti: string) {
  const found = await prisma.accessTokenBlocklist.findUnique({ where: { jti } });
  return !!found;
}

export async function issueRefreshToken(usuarioId: string) {
  const token = crypto.randomBytes(48).toString('base64url');
  const tokenHash = sha256Hex(token);
  const expiraEm = new Date(Date.now() + ENV.JWT_REFRESH_TOKEN_DIAS * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { usuarioId, tokenHash, expiraEm },
  });

  return { refreshToken: token, expiraEm };
}

export async function rotateRefreshToken(refreshToken: string) {
  const tokenHash = sha256Hex(refreshToken);
  const existing = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!existing) {
    return { ok: false as const, status: 401 as const, erro: 'Refresh token inválido' };
  }

  if (existing.revogadoEm) {
    return { ok: false as const, status: 401 as const, erro: 'Refresh token revogado' };
  }

  if (existing.expiraEm.getTime() < Date.now()) {
    return { ok: false as const, status: 401 as const, erro: 'Refresh token expirado' };
  }

  // Rotaciona: revoga o token atual e emite um novo
  await prisma.refreshToken.update({
    where: { tokenHash },
    data: { revogadoEm: new Date() },
  });

  const issued = await issueRefreshToken(existing.usuarioId);
  return { ok: true as const, usuarioId: existing.usuarioId, ...issued };
}

export async function revokeRefreshToken(refreshToken: string) {
  const tokenHash = sha256Hex(refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revogadoEm: null },
    data: { revogadoEm: new Date() },
  });
}
