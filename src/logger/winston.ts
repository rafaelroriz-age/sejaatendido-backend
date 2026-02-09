import winston from 'winston';
import { ENV } from '../env.js';

const isProd = ENV.NODE_ENV === 'production';

export const logger = winston.createLogger({
  level: ENV.LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: isProd
        ? winston.format.combine(winston.format.timestamp(), winston.format.json())
        : winston.format.combine(
            winston.format.colorize(),
            winston.format.timestamp(),
            winston.format.printf(({ level, message, timestamp, ...meta }) => {
              const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
              return `${timestamp} ${level}: ${message}${metaStr}`;
            })
          ),
    }),
  ],
});

export function requestLogger() {
  return (req: any, res: any, next: any) => {
    const start = Date.now();
    res.on('finish', () => {
      const ms = Date.now() - start;
      const status = res.statusCode;
      const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
      logger.log(level, 'http_request', {
        method: req.method,
        path: req.originalUrl,
        status,
        durationMs: ms,
        ip: req.ip,
        origin: typeof req.get?.('origin') === 'string' ? req.get('origin') : undefined,
        userAgent:
          typeof req.get?.('user-agent') === 'string' ? String(req.get('user-agent')).slice(0, 120) : undefined,
      });
    });
    next();
  };
}
