import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
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

dotenv.config();

const app = express();

// Middlewares globais
app.use(
  cors({
    origin: ENV.CORS_ORIGIN === '*' ? true : ENV.CORS_ORIGIN,
    credentials: true,
  })
);

// Stripe webhook precisa do corpo RAW (antes do json parser)
app.use('/pagamentos/webhook/stripe', express.raw({ type: 'application/json' }));

app.use(express.json());

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

const PORT = ENV.PORTA || 3001;
app.listen(PORT, () => {
  console.log(`🚀 API rodando em http://localhost:${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
