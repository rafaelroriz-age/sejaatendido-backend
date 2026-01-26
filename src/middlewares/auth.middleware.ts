import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../env.js';
import { isAccessTokenBlocked } from '../utils/authTokens.js';

interface TokenPayload {
  sub: string;
  tipo: string;
  jti: string;
}

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userTipo?: string;
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  (async () => {
    try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ erro: 'Token não fornecido' });
    }

    const [scheme, token] = authHeader.split(' '); // "Bearer TOKEN"

    if (!scheme || scheme.toLowerCase() !== 'bearer') {
      return res.status(401).json({ erro: 'Esquema de autenticação inválido' });
    }

    if (!token) {
      return res.status(401).json({ erro: 'Token malformado' });
    }

    const decoded = jwt.verify(token, ENV.JWT_SEGREDO) as any;
    const payload: TokenPayload = {
      sub: String(decoded.sub ?? ''),
      tipo: String(decoded.tipo ?? ''),
      jti: String(decoded.jti ?? ''),
    };

    if (!payload.sub || !payload.tipo || !payload.jti) {
      return res.status(401).json({ erro: 'Token inválido' });
    }

      // Token blacklist (logout)
      const blocked = await isAccessTokenBlocked(payload.jti);
      if (blocked) {
        return res.status(401).json({ erro: 'Token revogado' });
      }

      req.userId = payload.sub;
      req.userTipo = payload.tipo;

      return next();
    } catch {
      return res.status(401).json({ erro: 'Token inválido ou expirado' });
    }
  })();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userTipo) {
      return res.status(401).json({ erro: 'Não autenticado' });
    }

    if (!roles.includes(req.userTipo)) {
      return res.status(403).json({ erro: 'Sem permissão' });
    }

    next();
  };
}
