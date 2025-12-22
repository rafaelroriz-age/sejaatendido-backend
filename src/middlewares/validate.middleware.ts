import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export function validate(schema: z.ZodType<any, any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          erro: 'Dados inválidos',
          detalhes: error.issues.map((e) => ({
            campo: e.path.join('.'),
            mensagem: e.message,
          })),
        });
      }
      next(error);
    }
  };
}
