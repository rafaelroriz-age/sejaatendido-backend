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
import chatRoutes from './routes/chat.js';
import apiRoutes from './routes/api.js';
import { errorHandler } from './middlewares/error.middleware.js';
import { ENV } from './env.js';
import { startEmailJobs } from './jobs/email.jobs.js';
import { connectMongoDB } from './utils/mongodb.js';
import { logger, requestLogger } from './logger/winston.js';
import swaggerUi from 'swagger-ui-express';
import { openapi } from './openapi.js';
import systemRoutes from './routes/system.js';

// Garante que rejeições/exceções não tratadas não derrubem o processo
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
  // Não encerra — apenas loga
});
process.on('uncaughtException', (err) => {
  // Apenas loga — não encerra. Erros fatais reais (como falta de env) já
  // são lançados antes do listen() e impedem o processo de subir.
  console.error('[uncaughtException]', err);
});

const app = express();

// Remove header que revela tecnologia
app.disable('x-powered-by');

// Importante para deploy atrás de proxy (Render, Nginx, etc.)
app.set('trust proxy', 1);

// Middlewares globais
const allowAllOrigins = ENV.CORS_ORIGIN === '*';
const allowedOrigins = allowAllOrigins
  ? []
  : ENV.CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Permite requisições sem origin (Postman, apps mobile)
      if (!origin) return callback(null, true);
      if (allowAllOrigins) return callback(null, true);

      const ok = allowedOrigins.some((allowed) => origin === allowed || origin.includes(allowed));
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

// Stripe webhook precisa do corpo RAW (antes do json parser)
app.use('/pagamentos/webhook/stripe', express.raw({ type: 'application/json' }));

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

// Swagger UI — desabilitado em produção (pesado e não necessário em runtime)
// Para reabilitar: remova a condição abaixo e ajuste a env var
if (ENV.NODE_ENV !== 'production') {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));
} else {
  app.get('/docs', (_req, res) => res.redirect('/openapi.json'));
}

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
app.use('/api/chat', chatRoutes);
app.use('/api', apiRoutes);

// Sistema
app.use('/system', systemRoutes);

// Error handler (deve ser o último middleware)
app.use(errorHandler);

// Jobs internos (node-cron) — best-effort, não derruba a API
try {
  startEmailJobs();
} catch (e) {
  console.error('Falha ao iniciar email jobs (não fatal):', e);
}

// MongoDB (chat) - conecta se configurado, nunca derruba a API por padrão
connectMongoDB({ exitOnFail: ENV.MONGODB_REQUIRED }).catch((e) => {
  console.error('MongoDB connection error (não fatal):', e);
});

// Render (e outras plataformas) expõem a porta via env PORT
const portFromPlatform = process.env.PORT ? Number(process.env.PORT) : undefined;
const PORT = (Number.isFinite(portFromPlatform) && portFromPlatform! > 0 ? portFromPlatform : undefined) ?? ENV.PORTA ?? 3001;
app.listen(PORT, '0.0.0.0', () => {
  const baseUrl = ENV.BACKEND_URL || `http://0.0.0.0:${PORT}`;
  logger.info('api_started', { baseUrl, health: `${baseUrl.replace(/\/$/, '')}/health` });
});
