import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export function validate(schema: z.ZodType<any, any>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = await schema.parseAsync(req.body);
      // Sanitização: substitui body pelo objeto parseado
      req.body = parsed;
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

export function validateRequest(schemas: {
  body?: z.ZodTypeAny;
  query?: z.ZodTypeAny;
  params?: z.ZodTypeAny;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = (await schemas.query.parseAsync(req.query)) as any;
      }
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as any;
      }

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
