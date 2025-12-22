import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Logging seguro: evita despejar objetos grandes/headers em produção
  if (process.env.NODE_ENV === 'development') {
    console.error('Error:', err);
  } else {
    const name = typeof err?.name === 'string' ? err.name : 'Error';
    const message = typeof err?.message === 'string' ? err.message : 'Unexpected error';
    const code = typeof err?.code === 'string' ? err.code : undefined;
    console.error('Error:', { name, code, message });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ erro: 'Token inválido' });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ erro: 'Token expirado' });
  }

  if (err.code === 'P2002') {
    // Prisma unique constraint
    return res.status(400).json({ erro: 'Registro duplicado' });
  }

  if (err.code === 'P2025') {
    // Prisma record not found
    return res.status(404).json({ erro: 'Registro não encontrado' });
  }

  res.status(500).json({
    erro: 'Erro interno do servidor',
    ...(process.env.NODE_ENV === 'development' && { detalhes: err.message }),
  });
}
