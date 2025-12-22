import 'dotenv/config';

export const ENV = {
  // Servidor
  PORTA: Number(process.env.PORTA || 3001),
  NODE_ENV: process.env.NODE_ENV || 'development',

  // CORS
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',

  // JWT
  JWT_SEGREDO: process.env.JWT_SEGREDO || 'dev-secret-change-in-production',

  // Jobs/cron (protege endpoints de disparo automático)
  CRON_SECRET: process.env.CRON_SECRET || '',

  // Google OAuth
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',

  // Stripe
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || '',
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || '',

  // Firebase (FCM)
  // Pode ser um JSON inteiro (string) com service account, ou usar GOOGLE_APPLICATION_CREDENTIALS no deploy.
  FIREBASE_SERVICE_ACCOUNT_JSON: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',

  // Email (SMTP)
  SMTP_HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
  SMTP_PORT: Number(process.env.SMTP_PORT || 587),
  SMTP_USER: process.env.SMTP_USER || '',
  SMTP_PASS: process.env.SMTP_PASS || '',

  // Frontend URL (para links em emails)
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',

  // Database
  DATABASE_URL: process.env.DATABASE_URL || '',
};

