import nodemailer from 'nodemailer';
import { ENV } from '../env';

// Configuração do transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // true para 465, false para outras portas
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

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
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/confirmar-email?token=${token}" class="button">
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
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/medico/consultas" class="button">
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
    meetLink?: string
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
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/medicos" class="button">
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
            <div class="valor">R$ ${(valor / 100).toFixed(2)}</div>
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
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/resetar-senha?token=${token}" class="button">
              Redefinir Senha
            </a>
          </center>
          <p>Se você não solicitou a redefinição de senha, ignore este email.</p>
          <p>Este link expira em 1 hora.</p>
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
            <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/medico/dashboard" class="button">
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
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      console.warn('⚠️ SMTP não configurado. Email não enviado:', options.subject);
      return false;
    }

    await transporter.sendMail({
      from: `"SejaAtendido" <${process.env.SMTP_USER}>`,
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
  meetLink?: string
) {
  const template = templates.consultaConfirmada(nomePaciente, nomeMedico, data, meetLink);
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
  enviarLembreteConsulta,
  enviarPagamentoConfirmado,
  enviarRecuperarSenha,
  enviarMedicoAprovado,
};
