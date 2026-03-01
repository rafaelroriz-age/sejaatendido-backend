import nodemailer from 'nodemailer';
import { ENV } from '../env.js';

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const secure = ENV.SMTP_PORT === 465;
  const auth = ENV.SMTP_USER && ENV.SMTP_PASS ? { user: ENV.SMTP_USER, pass: ENV.SMTP_PASS } : undefined;

  transporter = nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    port: ENV.SMTP_PORT,
    secure,
    auth,
    // Pool de conexões para produção (evita abrir/fechar conexão a cada email)
    pool: true,
    maxConnections: 3,
    // Rate limiting — Zoho Free: máx 500 emails/dia
    rateDelta: 1000,
    rateLimit: 5,
  } as any);

  // Verificar conexão SMTP ao primeiro uso
  transporter.verify((err) => {
    if (err) {
      console.error('❌ Erro na conexão SMTP:', err.message);
    } else {
      console.log('✅ Servidor SMTP pronto para enviar emails');
    }
  });

  return transporter;
}

// Templates de email
const templates = {
  // =====================
  // CONFIRMAÇÃO DE EMAIL
  // =====================
  confirmacaoEmail: (nome: string, token: string) => ({
    subject: '🔐 Confirme seu email - SejaAtendido',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
          .header { text-align: center; color: #2196F3; }
          .button { display: inline-block; padding: 12px 30px; background: #2196F3; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">🏥 SejaAtendido</h1>
          <h2>Olá, ${nome}!</h2>
          <p>Obrigado por se cadastrar na plataforma SejaAtendido. Para confirmar seu email e ativar sua conta, clique no botão abaixo:</p>
          <center>
            <a href="${ENV.BACKEND_URL}/emails/confirmar-email?token=${token}" class="button">
              Confirmar Email
            </a>
          </center>
          <p>Se você não criou uma conta, ignore este email.</p>
          <p>Este link expira em 24 horas.</p>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SejaAtendido. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // =====================
  // CONSULTA AGENDADA (PACIENTE)
  // =====================
  consultaAgendada: (
    nomePaciente: string,
    nomeMedico: string,
    especialidade: string,
    data: Date,
    motivo: string
  ) => ({
    subject: '📅 Consulta Agendada - SejaAtendido',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
          .header { text-align: center; color: #4CAF50; }
          .info-box { background: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .info-row { display: flex; margin: 10px 0; }
          .label { font-weight: bold; width: 120px; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">✅ Consulta Agendada!</h1>
          <h2>Olá, ${nomePaciente}!</h2>
          <p>Sua consulta foi agendada com sucesso. Confira os detalhes:</p>
          <div class="info-box">
            <div class="info-row"><span class="label">Médico:</span> Dr(a). ${nomeMedico}</div>
            <div class="info-row"><span class="label">Especialidade:</span> ${especialidade}</div>
            <div class="info-row"><span class="label">Data:</span> ${data.toLocaleDateString('pt-BR')}</div>
            <div class="info-row"><span class="label">Horário:</span> ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            <div class="info-row"><span class="label">Motivo:</span> ${motivo}</div>
          </div>
          <p><strong>Importante:</strong> Aguarde a confirmação do médico. Você receberá um email quando a consulta for aceita.</p>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SejaAtendido. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // =====================
  // NOVA CONSULTA (MÉDICO)
  // =====================
  novaConsultaMedico: (
    nomeMedico: string,
    nomePaciente: string,
    data: Date,
    motivo: string
  ) => ({
    subject: '🔔 Nova Solicitação de Consulta - SejaAtendido',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
          .header { text-align: center; color: #FF9800; }
          .info-box { background: #fff3e0; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #FF9800; color: white; text-decoration: none; border-radius: 5px; margin: 10px 5px; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">🔔 Nova Consulta!</h1>
          <h2>Olá, Dr(a). ${nomeMedico}!</h2>
          <p>Você recebeu uma nova solicitação de consulta:</p>
          <div class="info-box">
            <div><strong>Paciente:</strong> ${nomePaciente}</div>
            <div><strong>Data:</strong> ${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            <div><strong>Motivo:</strong> ${motivo}</div>
          </div>
          <center>
            <a href="${ENV.FRONTEND_URL}/medico/consultas" class="button">
              Ver Consultas
            </a>
          </center>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SejaAtendido. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // =====================
  // CONSULTA CONFIRMADA
  // =====================
  consultaConfirmada: (
    nomePaciente: string,
    nomeMedico: string,
    data: Date,
    meetLink?: string,
    cancelarLink?: string
  ) => ({
    subject: '✅ Consulta Confirmada - SejaAtendido',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
          .header { text-align: center; color: #4CAF50; }
          .info-box { background: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .meet-link { background: #1a73e8; color: white; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0; }
          .meet-link a { color: white; font-size: 18px; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">✅ Consulta Confirmada!</h1>
          <h2>Olá, ${nomePaciente}!</h2>
          <p>Sua consulta com Dr(a). ${nomeMedico} foi confirmada!</p>
          <div class="info-box">
            <div><strong>Data:</strong> ${data.toLocaleDateString('pt-BR')}</div>
            <div><strong>Horário:</strong> ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          ${
            meetLink
              ? `
          <div class="meet-link">
            <p>🎥 Link para a teleconsulta:</p>
            <a href="${meetLink}">${meetLink}</a>
          </div>
          <p>Acesse o link 5 minutos antes do horário agendado.</p>
          `
              : ''
          }
          ${
            cancelarLink
              ? `
          <center>
            <a href="${cancelarLink}" class="button" style="background:#f44336;">
              Cancelar consulta
            </a>
          </center>
          <p style="color:#666; font-size: 12px;">Este link pode expirar e pode estar sujeito às regras de antecedência de cancelamento.</p>
          `
              : ''
          }
          <div class="footer">
            <p>© ${new Date().getFullYear()} SejaAtendido. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // =====================
  // CONSULTA CANCELADA
  // =====================
  consultaCancelada: (nome: string, nomeMedico: string, data: Date, motivo?: string) => ({
    subject: '❌ Consulta Cancelada - SejaAtendido',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
          .header { text-align: center; color: #f44336; }
          .info-box { background: #ffebee; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #2196F3; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">❌ Consulta Cancelada</h1>
          <h2>Olá, ${nome}!</h2>
          <p>Infelizmente a consulta abaixo foi cancelada:</p>
          <div class="info-box">
            <div><strong>Médico:</strong> Dr(a). ${nomeMedico}</div>
            <div><strong>Data:</strong> ${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            ${motivo ? `<div><strong>Motivo:</strong> ${motivo}</div>` : ''}
          </div>
          <center>
            <a href="${ENV.FRONTEND_URL}/medicos" class="button">
              Agendar Nova Consulta
            </a>
          </center>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SejaAtendido. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // =====================
  // LINK PARA CANCELAR CONSULTA
  // =====================
  linkCancelamentoConsulta: (nomePaciente: string, nomeMedico: string, data: Date, cancelarLink: string) => ({
    subject: '🔗 Link para cancelar sua consulta - SejaAtendido',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
          .header { text-align: center; color: #f44336; }
          .info-box { background: #ffebee; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .button { display: inline-block; padding: 12px 30px; background: #f44336; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">🔗 Link de cancelamento</h1>
          <h2>Olá, ${nomePaciente}!</h2>
          <p>Você solicitou o link para cancelamento da sua consulta.</p>
          <div class="info-box">
            <div><strong>Médico:</strong> Dr(a). ${nomeMedico}</div>
            <div><strong>Data:</strong> ${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <center>
            <a href="${cancelarLink}" class="button">Cancelar consulta</a>
          </center>
          <p style="color:#666; font-size: 12px;">Este link pode expirar e o cancelamento pode estar sujeito a regras de antecedência.</p>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SejaAtendido. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // =====================
  // LEMBRETE DE CONSULTA
  // =====================
  lembreteConsulta: (
    nomePaciente: string,
    nomeMedico: string,
    data: Date,
    meetLink?: string
  ) => ({
    subject: '⏰ Lembrete: Sua consulta é amanhã! - SejaAtendido',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
          .header { text-align: center; color: #2196F3; }
          .info-box { background: #e3f2fd; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .meet-link { background: #1a73e8; color: white; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0; }
          .meet-link a { color: white; font-size: 18px; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">⏰ Lembrete de Consulta</h1>
          <h2>Olá, ${nomePaciente}!</h2>
          <p>Este é um lembrete de que sua consulta é <strong>amanhã</strong>!</p>
          <div class="info-box">
            <div><strong>Médico:</strong> Dr(a). ${nomeMedico}</div>
            <div><strong>Data:</strong> ${data.toLocaleDateString('pt-BR')}</div>
            <div><strong>Horário:</strong> ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          ${
            meetLink
              ? `
          <div class="meet-link">
            <p>🎥 Link para a teleconsulta:</p>
            <a href="${meetLink}">${meetLink}</a>
          </div>
          `
              : ''
          }
          <div class="footer">
            <p>© ${new Date().getFullYear()} SejaAtendido. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // =====================
  // LEMBRETE 15 MIN ANTES
  // =====================
  lembrete15MinAntes: (nomePaciente: string, nomeMedico: string, data: Date, meetLink?: string) => ({
    subject: '⏳ Sua consulta é em 15 minutos! - SejaAtendido',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
          .header { text-align: center; color: #00acc1; }
          .info-box { background: #e0f7fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .checklist { background: #f8ffff; padding: 15px; border-radius: 5px; margin: 15px 0; }
          .meet-link { background: #1a73e8; color: white; padding: 15px; border-radius: 5px; text-align: center; margin: 20px 0; }
          .meet-link a { color: white; font-size: 18px; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">⏳ Sua consulta é em 15 minutos</h1>
          <h2>Olá, ${nomePaciente}!</h2>
          <div class="info-box">
            <div><strong>Médico:</strong> Dr(a). ${nomeMedico}</div>
            <div><strong>Horário:</strong> ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
            <div><strong>Data:</strong> ${data.toLocaleDateString('pt-BR')}</div>
          </div>
          <div class="checklist">
            <p><strong>Checklist rápido:</strong></p>
            <ul>
              <li>Teste sua conexão e áudio</li>
              <li>Esteja em um local silencioso</li>
              <li>Tenha documentos/exames em mãos</li>
            </ul>
          </div>
          ${
            meetLink
              ? `
          <div class="meet-link">
            <p>🎥 Link para a teleconsulta:</p>
            <a href="${meetLink}">${meetLink}</a>
          </div>
          `
              : ''
          }
          <div class="footer">
            <p>© ${new Date().getFullYear()} SejaAtendido. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // =====================
  // SOLICITAÇÃO DE AVALIAÇÃO
  // =====================
  solicitacaoAvaliacao: (nomePaciente: string, nomeMedico: string, data: Date, link: string) => ({
    subject: '⭐ Como foi sua consulta? Avalie agora - SejaAtendido',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
          .header { text-align: center; color: #00acc1; }
          .button { display: inline-block; padding: 12px 30px; background: #00acc1; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .info { background: #e0f7fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">⭐ Avalie sua consulta</h1>
          <h2>Olá, ${nomePaciente}!</h2>
          <p>Sua consulta foi concluída. Sua avaliação ajuda a melhorar a experiência.</p>
          <div class="info">
            <div><strong>Médico:</strong> Dr(a). ${nomeMedico}</div>
            <div><strong>Data:</strong> ${data.toLocaleDateString('pt-BR')}</div>
          </div>
          <center>
            <a href="${link}" class="button">Avaliar Consulta</a>
          </center>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SejaAtendido. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // =====================
  // PAGAMENTO CONFIRMADO
  // =====================
  pagamentoConfirmado: (nomePaciente: string, valor: number, nomeMedico: string, data: Date) => ({
    subject: '💳 Pagamento Confirmado - SejaAtendido',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
          .header { text-align: center; color: #4CAF50; }
          .info-box { background: #e8f5e9; padding: 20px; border-radius: 5px; margin: 20px 0; }
          .valor { font-size: 24px; font-weight: bold; color: #4CAF50; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">💳 Pagamento Confirmado!</h1>
          <h2>Olá, ${nomePaciente}!</h2>
          <p>Seu pagamento foi processado com sucesso.</p>
          <div class="info-box">
            <div class="valor">R$ ${valor.toFixed(2)}</div>
            <div><strong>Consulta com:</strong> Dr(a). ${nomeMedico}</div>
            <div><strong>Data:</strong> ${data.toLocaleDateString('pt-BR')} às ${data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SejaAtendido. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // =====================
  // RECUPERAÇÃO DE SENHA
  // =====================
  recuperarSenha: (nome: string, token: string) => ({
    subject: '🔑 Recuperação de Senha - SejaAtendido',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
          .header { text-align: center; color: #FF9800; }
          .button { display: inline-block; padding: 12px 30px; background: #FF9800; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">🔑 Recuperação de Senha</h1>
          <h2>Olá, ${nome}!</h2>
          <p>Recebemos uma solicitação para redefinir sua senha. Se foi você, clique no botão abaixo:</p>
          <center>
            <a href="${ENV.FRONTEND_URL}/resetar-senha?token=${token}" class="button">
              Redefinir Senha
            </a>
          </center>
          <p>Se você não solicitou a redefinição de senha, ignore este email.</p>
          <p>Este link expira em ${ENV.PASSWORD_RESET_TTL_HORAS} hora(s).</p>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SejaAtendido. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),

  // =====================
  // MÉDICO APROVADO
  // =====================
  medicoAprovado: (nome: string) => ({
    subject: '🎉 Sua conta foi aprovada! - SejaAtendido',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; padding: 30px; }
          .header { text-align: center; color: #4CAF50; }
          .button { display: inline-block; padding: 12px 30px; background: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
          .footer { text-align: center; color: #888; font-size: 12px; margin-top: 30px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1 class="header">🎉 Parabéns, Dr(a). ${nome}!</h1>
          <h2>Sua conta foi aprovada!</h2>
          <p>Você agora faz parte da nossa rede de médicos. Já pode começar a receber consultas.</p>
          <center>
            <a href="${ENV.FRONTEND_URL}/medico/dashboard" class="button">
              Acessar Dashboard
            </a>
          </center>
          <div class="footer">
            <p>© ${new Date().getFullYear()} SejaAtendido. Todos os direitos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  }),
};

// =====================
// FUNÇÕES DE ENVIO
// =====================

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function enviarEmail(options: EmailOptions): Promise<boolean> {
  try {
    // Verificar se SMTP está configurado
    if (!ENV.SMTP_USER || !ENV.SMTP_PASS) {
      console.warn('⚠️ SMTP não configurado. Email não enviado:', options.subject);
      return false;
    }

    const fromAddress = ENV.EMAIL_FROM || `SejAAtendido <${ENV.SMTP_USER}>`;

    await getTransporter().sendMail({
      from: fromAddress,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    console.log(`✉️ Email enviado para ${options.to}: ${options.subject}`);
    return true;
  } catch (error) {
    console.error('❌ Erro ao enviar email:', error);
    return false;
  }
}

// Funções de conveniência para cada tipo de email
export async function enviarConfirmacaoEmail(email: string, nome: string, token: string) {
  const template = templates.confirmacaoEmail(nome, token);
  return enviarEmail({ to: email, ...template });
}

export async function enviarConsultaAgendada(
  email: string,
  nomePaciente: string,
  nomeMedico: string,
  especialidade: string,
  data: Date,
  motivo: string
) {
  const template = templates.consultaAgendada(nomePaciente, nomeMedico, especialidade, data, motivo);
  return enviarEmail({ to: email, ...template });
}

export async function enviarNovaConsultaMedico(
  email: string,
  nomeMedico: string,
  nomePaciente: string,
  data: Date,
  motivo: string
) {
  const template = templates.novaConsultaMedico(nomeMedico, nomePaciente, data, motivo);
  return enviarEmail({ to: email, ...template });
}

export async function enviarConsultaConfirmada(
  email: string,
  nomePaciente: string,
  nomeMedico: string,
  data: Date,
  meetLink?: string,
  cancelarLink?: string
) {
  const template = templates.consultaConfirmada(nomePaciente, nomeMedico, data, meetLink, cancelarLink);
  return enviarEmail({ to: email, ...template });
}

export async function enviarConsultaCancelada(
  email: string,
  nome: string,
  nomeMedico: string,
  data: Date,
  motivo?: string
) {
  const template = templates.consultaCancelada(nome, nomeMedico, data, motivo);
  return enviarEmail({ to: email, ...template });
}

export async function enviarLinkCancelamentoConsulta(
  email: string,
  nomePaciente: string,
  nomeMedico: string,
  data: Date,
  cancelarLink: string
) {
  const template = templates.linkCancelamentoConsulta(nomePaciente, nomeMedico, data, cancelarLink);
  return enviarEmail({ to: email, ...template });
}

export async function enviarLembreteConsulta(
  email: string,
  nomePaciente: string,
  nomeMedico: string,
  data: Date,
  meetLink?: string
) {
  const template = templates.lembreteConsulta(nomePaciente, nomeMedico, data, meetLink);
  return enviarEmail({ to: email, ...template });
}

export async function enviarLembrete15MinAntes(
  email: string,
  nomePaciente: string,
  nomeMedico: string,
  data: Date,
  meetLink?: string
) {
  const template = templates.lembrete15MinAntes(nomePaciente, nomeMedico, data, meetLink);
  return enviarEmail({ to: email, ...template });
}

export async function enviarPagamentoConfirmado(
  email: string,
  nomePaciente: string,
  valor: number,
  nomeMedico: string,
  data: Date
) {
  const template = templates.pagamentoConfirmado(nomePaciente, valor, nomeMedico, data);
  return enviarEmail({ to: email, ...template });
}

export async function enviarSolicitacaoAvaliacao(
  email: string,
  nomePaciente: string,
  nomeMedico: string,
  data: Date,
  link: string
) {
  const template = templates.solicitacaoAvaliacao(nomePaciente, nomeMedico, data, link);
  return enviarEmail({ to: email, ...template });
}

export async function enviarRecuperarSenha(email: string, nome: string, token: string) {
  const template = templates.recuperarSenha(nome, token);
  return enviarEmail({ to: email, ...template });
}

export async function enviarMedicoAprovado(email: string, nome: string) {
  const template = templates.medicoAprovado(nome);
  return enviarEmail({ to: email, ...template });
}

export default {
  enviarEmail,
  enviarConfirmacaoEmail,
  enviarConsultaAgendada,
  enviarNovaConsultaMedico,
  enviarConsultaConfirmada,
  enviarConsultaCancelada,
  enviarLinkCancelamentoConsulta,
  enviarLembreteConsulta,
  enviarLembrete15MinAntes,
  enviarPagamentoConfirmado,
  enviarSolicitacaoAvaliacao,
  enviarRecuperarSenha,
  enviarMedicoAprovado,
};
