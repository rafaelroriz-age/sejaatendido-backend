import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth.js';
import medicoRoutes from './routes/medicos.js';
import pacienteRoutes from './routes/pacientes.js';
import adminRoutes from './routes/admin.js';
import pagamentoRoutes from './routes/pagamentos.js';
import usuarioRoutes from './routes/usuarios.js';
import emailRoutes from './routes/emails.js';
import notificacoesRoutes from './routes/notificacoes.js';
import repassesRoutes from './routes/repasses.js';
// Chat desabilitado (requer MongoDB)
// import chatRoutes from './routes/chat.js';
import apiRoutes from './routes/api.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { ENV } from './env.js';
import { startEmailJobs } from './jobs/email.jobs.js';
import { connectWhatsApp } from './services/whatsapp.service.js';
// MongoDB/Chat desabilitado (não essencial, economiza ~7MB no npm ci)
// Para reabilitar: npm i mongoose mongodb, descomentar import abaixo
// import { connectMongoDB } from './utils/mongodb.js';
import { logger, requestLogger } from './logger/winston.js';
// swagger-ui-express removido do bundle de produção (12MB+)
// Para reabilitar: npm i swagger-ui-express && descomentar
// import swaggerUi from 'swagger-ui-express';
import { openapi } from './openapi.js';
import systemRoutes from './routes/system.js';

// Garante que rejeições/exceções não tratadas não derrubem o processo
process.on('unhandledRejection', (reason) => {
  logger.error('unhandledRejection', { reason: reason instanceof Error ? { name: reason.name, message: reason.message } : String(reason) });
  // Não encerra — apenas loga
});
process.on('uncaughtException', (err) => {
  // Apenas loga — não encerra. Erros fatais reais (como falta de env) já
  // são lançados antes do listen() e impedem o processo de subir.
  logger.error('uncaughtException', { err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err) });
});

const app = express();

// Remove header que revela tecnologia
app.disable('x-powered-by');

// Importante para deploy atrás de proxy (Render, Nginx, etc.)
app.set('trust proxy', ENV.NODE_ENV === 'production' ? 1 : 0);

// Middlewares globais
const allowAllOrigins = ENV.CORS_ORIGIN === '*';
const allowedOrigins = allowAllOrigins
  ? []
  : ENV.CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean);

function isOriginAllowed(origin: string, allowedList: string[]): boolean {
  // Normaliza o origin recebido (pode ser inválido em alguns clientes)
  let originUrl: URL | null = null;
  try {
    originUrl = new URL(origin);
  } catch {
    originUrl = null;
  }

  for (const rawAllowed of allowedList) {
    const allowed = rawAllowed.trim();
    if (!allowed) continue;

    // Match exato (mais seguro)
    if (origin === allowed) return true;

    // Suporte a wildcard de subdomínio (ex: "https://*.vercel.app" ou "*.vercel.app")
    const allowedHasScheme = allowed.includes('://');
    const allowedValue = allowedHasScheme ? allowed : `https://${allowed}`;

    let allowedUrl: URL | null = null;
    try {
      allowedUrl = new URL(allowedValue);
    } catch {
      allowedUrl = null;
    }

    if (!originUrl || !allowedUrl) continue;

    const allowedHost = allowedUrl.hostname;
    const originHost = originUrl.hostname;

    // Se o allowlist incluiu scheme, exigimos o mesmo scheme
    if (allowedHasScheme && originUrl.protocol !== allowedUrl.protocol) continue;

    // Match hostname exato
    if (!allowedHost.includes('*')) {
      if (originHost === allowedHost) return true;
      continue;
    }

    // Wildcard somente no formato "*.dominio.tld"
    if (allowedHost.startsWith('*.')) {
      const suffix = allowedHost.slice(1); // ".dominio.tld"
      if (originHost.endsWith(suffix) && originHost.length > suffix.length) {
        return true;
      }
    }
  }

  return false;
}

app.use(
  cors({
    origin: (origin, callback) => {
      // Permite requisições sem origin (Postman, apps mobile)
      if (!origin) return callback(null, true);
      if (allowAllOrigins) return callback(null, true);

      const ok = isOriginAllowed(origin, allowedOrigins);
      return ok ? callback(null, true) : callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
    // Se aceitar qualquer origin, NÃO use cookies/credenciais
    credentials: !allowAllOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

app.use(requestLogger());

app.use(
  rateLimit({
    windowMs: 15 * 60_000,
    limit: 200,
    message: 'Muitas requisições, tente novamente em 15 minutos',
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Rate limit mais forte para autenticação
const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 10,
  message: 'Muitas tentativas de login/registro, aguarde 15 minutos',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(['/auth/login', '/auth/register', '/api/auth/login', '/api/auth/register'], authLimiter);

// Stripe desabilitado — reabilitar quando necessário:
// app.use('/pagamentos/webhook/stripe', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '1mb' }));

// Health check
app.get('/', (req, res) => {
  res.json({
    ok: true,
    servico: 'sejaatendido-backend',
    versao: '1.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/openapi.json', (req, res) => {
  res.json(openapi);
});

// Swagger UI removido (dependência pesada de 12MB+)
// Para reabilitar: npm i swagger-ui-express, descomentar import e descomentar as 2 linhas abaixo:
// app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
app.get('/docs', (_req, res) => res.redirect('/openapi.json'));

// Rotas
app.use('/auth', authRoutes);
app.use('/api/auth', authRoutes);
app.use('/medicos', medicoRoutes);
app.use('/paciente', pacienteRoutes);
app.use('/admin', adminRoutes);
app.use('/pagamentos', pagamentoRoutes);
app.use('/usuarios', usuarioRoutes);
app.use('/emails', emailRoutes);
app.use('/notificacoes', notificacoesRoutes);
app.use('/repasses', repassesRoutes);
// Chat desabilitado (requer MongoDB)
// app.use('/api/chat', chatRoutes);
app.use('/api/chat', (_req, res) => res.status(503).json({ erro: 'Chat indisponível (MongoDB desabilitado)' }));
app.use('/api', apiRoutes);

// Sistema
app.use('/system', systemRoutes);

// Error handler (deve ser o último middleware)
app.use(errorHandler);

// Jobs internos (node-cron) — best-effort, não derruba a API
try {
  startEmailJobs();
} catch (e) {
  logger.warn('email_jobs_start_failed', { error: e instanceof Error ? { name: e.name, message: e.message } : String(e) });
}

// WhatsApp Baileys — best-effort, não derruba a API
if (ENV.ENABLE_WHATSAPP) {
  connectWhatsApp().catch((e) => {
    logger.warn('whatsapp_connect_failed', { error: e instanceof Error ? { name: e.name, message: e.message } : String(e) });
  });
}

// MongoDB desabilitado — reabilitar quando necessário:
// connectMongoDB({ exitOnFail: ENV.MONGODB_REQUIRED }).catch((e) => {
//   console.error('MongoDB connection error (não fatal):', e);
// });

// Render (e outras plataformas) expõem a porta via env PORT
const portFromPlatform = process.env.PORT ? Number(process.env.PORT) : undefined;
const PORT = (Number.isFinite(portFromPlatform) && portFromPlatform! > 0 ? portFromPlatform : undefined) ?? ENV.PORTA ?? 3001;
app.listen(PORT, '0.0.0.0', () => {
  const baseUrl = ENV.BACKEND_URL || `http://0.0.0.0:${PORT}`;
  logger.info('api_started', { baseUrl, health: `${baseUrl.replace(/\/$/, '')}/health` });
});
