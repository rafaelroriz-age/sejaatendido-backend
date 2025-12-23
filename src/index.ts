import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import authRoutes from './routes/auth';
import medicoRoutes from './routes/medicos';
import pacienteRoutes from './routes/pacientes';
import adminRoutes from './routes/admin';
import pagamentoRoutes from './routes/pagamentos';
import usuarioRoutes from './routes/usuarios';
import emailRoutes from './routes/emails';
import notificacoesRoutes from './routes/notificacoes';
import { errorHandler } from './middlewares/error.middleware';
import { ENV } from './env';
import { startEmailJobs } from './jobs/email.jobs';

dotenv.config();

const app = express();

// Importante para deploy atrás de proxy (Render, Nginx, etc.)
app.set('trust proxy', 1);

// Middlewares globais
const allowAllOrigins = ENV.CORS_ORIGIN === '*';
app.use(
  cors({
    origin: allowAllOrigins ? true : ENV.CORS_ORIGIN,
    // Se aceitar qualquer origin, NÃO use cookies/credenciais
    credentials: allowAllOrigins ? false : true,
  })
);

app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);

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

// Rotas
app.use('/auth', authRoutes);
app.use('/medicos', medicoRoutes);
app.use('/paciente', pacienteRoutes);
app.use('/admin', adminRoutes);
app.use('/pagamentos', pagamentoRoutes);
app.use('/usuarios', usuarioRoutes);
app.use('/emails', emailRoutes);
app.use('/notificacoes', notificacoesRoutes);

// Error handler (deve ser o último middleware)
app.use(errorHandler);

// Jobs internos (node-cron)
startEmailJobs();

const PORT = ENV.PORTA || 3001;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
