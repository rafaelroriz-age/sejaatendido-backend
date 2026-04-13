import { notificarWhatsApp } from './notification.service.js';
import { ENV } from '../env.js';
import { logger } from '../logger/winston.js';

function formatDate(date: Date): string {
  const d = new Date(date);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function formatTime(date: Date): string {
  const d = new Date(date);
  const hh = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${min}`;
}

interface ConsultaNotifyParams {
  consultaId: string;
  paciente: { usuarioId: string; nome: string; telefone?: string | null };
  medico: { usuarioId: string; nome: string; telefone?: string | null };
  data: Date;
  tipo?: string;
  guia?: string;
}

/**
 * Notifica paciente e médico sobre nova consulta via WhatsApp.
 * Não lança erros — apenas loga e continua.
 */
export async function notifyAppointmentCreated(params: ConsultaNotifyParams): Promise<void> {
  const { consultaId, paciente, medico, data, tipo, guia } = params;
  const appUrl = ENV.FRONTEND_URL;
  const dataFormatada = formatDate(data);
  const horaFormatada = formatTime(data);
  const tipoLabel = tipo || 'Consulta';
  const guiaLabel = guia || consultaId.slice(0, 8);

  // Mensagem para paciente
  if (paciente.telefone) {
    try {
      await notificarWhatsApp({
        consultaId,
        usuarioId: paciente.usuarioId,
        tipoEvento: 'CONSULTA_AGENDADA',
        telefone: paciente.telefone,
        mensagem:
          `🗓️ *Novo agendamento confirmado!*\n` +
          `Tipo: *${tipoLabel}*\n` +
          `Data: *${dataFormatada}*\n` +
          `Hora: *${horaFormatada}*\n` +
          `Guia: *${guiaLabel}*\n` +
          `Profissional: *${medico.nome}*\n\n` +
          `Serviço agendado via SejAtendido.\n` +
          `👉 Acesse sua guia: ${appUrl}/guia/${guiaLabel}`,
      });
    } catch (e) {
      logger.warn('whatsapp_notify_paciente_error', { consultaId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Mensagem para médico
  if (medico.telefone) {
    try {
      await notificarWhatsApp({
        consultaId,
        usuarioId: medico.usuarioId,
        tipoEvento: 'CONSULTA_AGENDADA',
        telefone: medico.telefone,
        mensagem:
          `😊 *Novo agendamento recebido!*\n` +
          `Tipo: *${tipoLabel}*\n` +
          `Data: *${dataFormatada}*\n` +
          `Hora: *${horaFormatada}*\n` +
          `Guia: *${guiaLabel}*\n` +
          `Paciente: *${paciente.nome}*\n\n` +
          `Agendado via SejAtendido.\n` +
          `👉 Ver detalhes: ${appUrl}/consultas/${guiaLabel}`,
      });
    } catch (e) {
      logger.warn('whatsapp_notify_medico_error', { consultaId, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

/**
 * Notifica paciente e médico sobre cancelamento via WhatsApp.
 */
export async function notifyAppointmentCancelled(params: ConsultaNotifyParams): Promise<void> {
  const { consultaId, paciente, medico, data } = params;
  const dataFormatada = formatDate(data);
  const horaFormatada = formatTime(data);

  if (paciente.telefone) {
    try {
      await notificarWhatsApp({
        consultaId,
        usuarioId: paciente.usuarioId,
        tipoEvento: 'CONSULTA_CANCELADA',
        telefone: paciente.telefone,
        mensagem:
          `❌ *Consulta cancelada*\n` +
          `Data: *${dataFormatada}* às *${horaFormatada}*\n` +
          `Profissional: *${medico.nome}*\n\n` +
          `Caso tenha dúvidas, entre em contato pelo app SejAtendido.`,
      });
    } catch (e) {
      logger.warn('whatsapp_cancel_paciente_error', { consultaId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (medico.telefone) {
    try {
      await notificarWhatsApp({
        consultaId,
        usuarioId: medico.usuarioId,
        tipoEvento: 'CONSULTA_CANCELADA',
        telefone: medico.telefone,
        mensagem:
          `❌ *Consulta cancelada*\n` +
          `Data: *${dataFormatada}* às *${horaFormatada}*\n` +
          `Paciente: *${paciente.nome}*\n\n` +
          `Cancelado via SejAtendido.`,
      });
    } catch (e) {
      logger.warn('whatsapp_cancel_medico_error', { consultaId, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

/**
 * Envia lembrete 24h antes para paciente via WhatsApp.
 */
export async function sendReminderMessage(params: {
  consultaId: string;
  paciente: { usuarioId: string; nome: string; telefone?: string | null };
  medico: { nome: string };
  data: Date;
  guia?: string;
}): Promise<void> {
  const { consultaId, paciente, medico, data, guia } = params;

  if (!paciente.telefone) return;

  const appUrl = ENV.FRONTEND_URL;
  const dataFormatada = formatDate(data);
  const horaFormatada = formatTime(data);
  const guiaLabel = guia || consultaId.slice(0, 8);

  try {
    await notificarWhatsApp({
      consultaId,
      usuarioId: paciente.usuarioId,
      tipoEvento: 'LEMBRETE_24H',
      telefone: paciente.telefone,
      mensagem:
        `⏰ *Lembrete: você tem uma consulta amanhã!*\n` +
        `Data: *${dataFormatada}* às *${horaFormatada}*\n` +
        `Profissional: *${medico.nome}*\n` +
        `Guia: *${guiaLabel}*\n\n` +
        `Confirme sua presença: ${appUrl}/confirmar/${guiaLabel}`,
    });
  } catch (e) {
    logger.warn('whatsapp_reminder_error', { consultaId, error: e instanceof Error ? e.message : String(e) });
  }
}
