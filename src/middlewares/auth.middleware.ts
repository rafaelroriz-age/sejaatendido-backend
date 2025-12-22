import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ENV } from '../env';

interface TokenPayload {
  id: string;
  tipo: string;
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
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ erro: 'Token não fornecido' });
    }

    const [, token] = authHeader.split(' '); // "Bearer TOKEN"

    if (!token) {
      return res.status(401).json({ erro: 'Token malformado' });
    }

    const decoded = jwt.verify(token, ENV.JWT_SEGREDO) as TokenPayload;

    req.userId = decoded.id;
    req.userTipo = decoded.tipo;

    next();
  } catch (error) {
    return res.status(401).json({ erro: 'Token inválido ou expirado' });
  }
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
