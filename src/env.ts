import 'dotenv/config';
import { z } from 'zod';

const NodeEnvSchema = z.enum(['development', 'test', 'production']);

const EnvSchema = z
  .object({
    // Servidor
    PORTA: z.coerce.number().int().positive().max(65535).default(3001),
    NODE_ENV: NodeEnvSchema.default('development'),

    // CORS
    // Pode ser um domínio/URL (ex: https://app.com) OU "*".
    CORS_ORIGIN: z.string().trim().min(1).default('*'),

    // JWT
    JWT_SEGREDO: z.string().trim().min(1),

    // Jobs/cron (protege endpoints de disparo automático)
    CRON_SECRET: z.string().default(''),

    // Google OAuth
    GOOGLE_CLIENT_ID: z.string().default(''),
    GOOGLE_CLIENT_SECRET: z.string().default(''),

    // Stripe
    STRIPE_SECRET_KEY: z.string().default(''),
    STRIPE_WEBHOOK_SECRET: z.string().default(''),

    // Firebase (FCM)
    FIREBASE_SERVICE_ACCOUNT_JSON: z.string().default(''),

    // Email (SMTP)
    SMTP_HOST: z.string().default('smtp.gmail.com'),
    SMTP_PORT: z.coerce.number().int().positive().max(65535).default(587),
    SMTP_USER: z.string().default(''),
    SMTP_PASS: z.string().default(''),

    // Frontend/Backend (links em emails)
    FRONTEND_URL: z.string().default('http://localhost:3000'),
    BACKEND_URL: z.string().default('http://localhost:3001'),

    // Jobs (emails automáticos)
    ENABLE_EMAIL_JOBS: z
      .preprocess((v) => String(v ?? '').toLowerCase() === 'true', z.boolean())
      .default(false),
    CONSULTA_DURACAO_MINUTOS: z.coerce.number().int().positive().default(60),

    // Tokens (hash no banco)
    EMAIL_VERIFICACAO_TTL_HORAS: z.coerce.number().int().positive().default(24),
    CANCEL_TOKEN_TTL_HORAS: z.coerce.number().int().positive().default(24),

    // Database
    DATABASE_URL: z.string().trim().min(1),
    DIRECT_URL: z.string().trim().min(1),

    // MongoDB (chat) - opcional
    MONGODB_URI: z.string().default(''),
  })
  .strict();

export const ENV = (() => {
  const parsed = EnvSchema.safeParse({
    PORTA: process.env.PORTA ?? process.env.PORT,
    NODE_ENV: process.env.NODE_ENV,
    CORS_ORIGIN: process.env.CORS_ORIGIN,
    JWT_SEGREDO: process.env.JWT_SEGREDO,
    CRON_SECRET: process.env.CRON_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASS: process.env.SMTP_PASS,
    FRONTEND_URL: process.env.FRONTEND_URL,
    BACKEND_URL: process.env.BACKEND_URL,
    ENABLE_EMAIL_JOBS: process.env.ENABLE_EMAIL_JOBS,
    CONSULTA_DURACAO_MINUTOS: process.env.CONSULTA_DURACAO_MINUTOS,
    EMAIL_VERIFICACAO_TTL_HORAS: process.env.EMAIL_VERIFICACAO_TTL_HORAS,
    CANCEL_TOKEN_TTL_HORAS: process.env.CANCEL_TOKEN_TTL_HORAS,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    MONGODB_URI: process.env.MONGODB_URI,
  });

  if (!parsed.success) {
    const message = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuração de ambiente inválida:\n${message}`);
  }

  const env = parsed.data;

  // Fail-fast em produção para evitar configurações inseguras
  if (env.NODE_ENV === 'production') {
    if (env.JWT_SEGREDO.length < 24) {
      throw new Error('JWT_SEGREDO fraco em produção. Defina um segredo forte (>= 24 chars).');
    }

    if (env.CORS_ORIGIN === '*') {
      throw new Error('CORS_ORIGIN não pode ser "*" em produção. Informe o domínio do frontend.');
    }

    // URLs públicas: evita valores locais em produção
    const looksLocal = (url: string) => /(^|\/\/)(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(url);
    if (looksLocal(env.FRONTEND_URL) || !/^https?:\/\//i.test(env.FRONTEND_URL)) {
      throw new Error('FRONTEND_URL inválida em produção. Use uma URL pública (ex: https://app.seudominio.com).');
    }
    if (looksLocal(env.BACKEND_URL) || !/^https?:\/\//i.test(env.BACKEND_URL)) {
      throw new Error('BACKEND_URL inválida em produção. Use uma URL pública (ex: https://api.seudominio.com).');
    }

    // Stripe: exige par completo quando habilitado
    const stripeEnabled = !!env.STRIPE_SECRET_KEY || !!env.STRIPE_WEBHOOK_SECRET;
    if (stripeEnabled) {
      if (!env.STRIPE_SECRET_KEY) {
        throw new Error('STRIPE_SECRET_KEY ausente em produção (Stripe parece habilitado).');
      }
      if (!env.STRIPE_WEBHOOK_SECRET) {
        throw new Error('STRIPE_WEBHOOK_SECRET ausente em produção (Stripe parece habilitado).');
      }
    }

    // SMTP/Emails: exige credenciais completas quando jobs estiverem ativos ou quando qualquer credencial for informada
    const smtpEnabled = env.ENABLE_EMAIL_JOBS || !!env.SMTP_USER || !!env.SMTP_PASS;
    if (smtpEnabled) {
      if (!env.SMTP_HOST) throw new Error('SMTP_HOST ausente em produção (email parece habilitado).');
      if (!env.SMTP_PORT) throw new Error('SMTP_PORT ausente em produção (email parece habilitado).');
      if (!env.SMTP_USER) throw new Error('SMTP_USER ausente em produção (email parece habilitado).');
      if (!env.SMTP_PASS) throw new Error('SMTP_PASS ausente em produção (email parece habilitado).');
    }

    // Jobs internos: exija CRON_SECRET para evitar endpoints desprotegidos
    if (env.ENABLE_EMAIL_JOBS && !env.CRON_SECRET) {
      throw new Error('CRON_SECRET é obrigatório em produção quando ENABLE_EMAIL_JOBS=true.');
    }

    // Firebase: se informado como JSON, valide parse
    if (env.FIREBASE_SERVICE_ACCOUNT_JSON) {
      try {
        JSON.parse(env.FIREBASE_SERVICE_ACCOUNT_JSON);
      } catch {
        throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON inválido: não é um JSON válido.');
      }
    }
  }

  return env;
})();

