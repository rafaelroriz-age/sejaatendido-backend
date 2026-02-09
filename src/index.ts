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

const app = express();

// Remove header que revela tecnologia
app.disable('x-powered-by');

// Importante para deploy atrás de proxy (Render, Nginx, etc.)
app.set('trust proxy', 1);

// Middlewares globais
const allowAllOrigins = ENV.CORS_ORIGIN === '*';
const allowedOrigins = allowAllOrigins
  ? undefined
  : ENV.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);

app.use(
  cors({
    origin: allowAllOrigins ? true : allowedOrigins,
    // Se aceitar qualquer origin, NÃO use cookies/credenciais
    credentials: allowAllOrigins ? false : true,
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
    windowMs: 60_000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

// Rate limit mais forte para auth
app.use(
  '/auth',
  rateLimit({
    windowMs: 60_000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

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
  res.json({ status: 'healthy' });
});

app.get('/openapi.json', (req, res) => {
  res.json(openapi);
});

app.use('/docs', swaggerUi.serve, swaggerUi.setup(openapi));

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

// Error handler (deve ser o último middleware)
app.use(errorHandler);

// Jobs internos (node-cron)
startEmailJobs();

// MongoDB (chat) - conecta se configurado
connectMongoDB({ exitOnFail: ENV.NODE_ENV === 'production' && !!ENV.MONGODB_URI });

// Render (e outras plataformas) expõem a porta via env PORT
const portFromPlatform = process.env.PORT ? Number(process.env.PORT) : undefined;
const PORT = (Number.isFinite(portFromPlatform) && portFromPlatform! > 0 ? portFromPlatform : undefined) ?? ENV.PORTA ?? 3001;
app.listen(PORT, () => {
  const baseUrl = ENV.BACKEND_URL || `http://0.0.0.0:${PORT}`;
  logger.info('api_started', { baseUrl, health: `${baseUrl.replace(/\/$/, '')}/health` });
});
