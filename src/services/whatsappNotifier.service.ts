import { enviarWhatsAppTemplate } from './whatsapp.service.js';
import { prisma } from '../utils/prisma.js';
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

async function logNotificacao(params: {
  consultaId: string;
  usuarioId: string;
  tipoEvento: string;
  ok: boolean;
}) {
  try {
    await prisma.notificacaoLog.create({
      data: {
        consultaId: params.consultaId,
        usuarioId: params.usuarioId,
        canal: 'WHATSAPP',
        tipoEvento: params.tipoEvento,
        status: params.ok ? 'ENVIADO' : 'FALHOU',
      },
    });
  } catch (e) {
    logger.warn('whatsapp_notificacao_log_failed', { error: e instanceof Error ? e.message : String(e) });
  }
}

/**
 * Template: novo_agendamento
 * Parâmetros body: {{1}} nome paciente/profissional, {{2}} tipo, {{3}} data, {{4}} hora, {{5}} guia
 */
export async function notifyAppointmentCreated(params: ConsultaNotifyParams): Promise<void> {
  const { consultaId, paciente, medico, data, tipo, guia } = params;
  const dataFormatada = formatDate(data);
  const horaFormatada = formatTime(data);
  const tipoLabel = tipo || 'Consulta';
  const guiaLabel = guia || consultaId.slice(0, 8);

  // Notifica paciente
  if (paciente.telefone) {
    try {
      const ok = await enviarWhatsAppTemplate({
        para: paciente.telefone,
        templateName: 'novo_agendamento',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: paciente.nome },
              { type: 'text', text: tipoLabel },
              { type: 'text', text: dataFormatada },
              { type: 'text', text: horaFormatada },
              { type: 'text', text: guiaLabel },
              { type: 'text', text: medico.nome },
            ],
          },
        ],
      });
      await logNotificacao({ consultaId, usuarioId: paciente.usuarioId, tipoEvento: 'CONSULTA_AGENDADA', ok });
    } catch (e) {
      logger.warn('whatsapp_notify_paciente_error', { consultaId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  // Notifica médico
  if (medico.telefone) {
    try {
      const ok = await enviarWhatsAppTemplate({
        para: medico.telefone,
        templateName: 'novo_agendamento',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: medico.nome },
              { type: 'text', text: tipoLabel },
              { type: 'text', text: dataFormatada },
              { type: 'text', text: horaFormatada },
              { type: 'text', text: guiaLabel },
              { type: 'text', text: paciente.nome },
            ],
          },
        ],
      });
      await logNotificacao({ consultaId, usuarioId: medico.usuarioId, tipoEvento: 'CONSULTA_AGENDADA', ok });
    } catch (e) {
      logger.warn('whatsapp_notify_medico_error', { consultaId, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

/**
 * Template: cancelamento_consulta
 * Parâmetros body: {{1}} nome destinatário, {{2}} data, {{3}} hora, {{4}} nome contraparte
 */
export async function notifyAppointmentCancelled(params: ConsultaNotifyParams): Promise<void> {
  const { consultaId, paciente, medico, data } = params;
  const dataFormatada = formatDate(data);
  const horaFormatada = formatTime(data);

  if (paciente.telefone) {
    try {
      const ok = await enviarWhatsAppTemplate({
        para: paciente.telefone,
        templateName: 'cancelamento_consulta',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: paciente.nome },
              { type: 'text', text: dataFormatada },
              { type: 'text', text: horaFormatada },
              { type: 'text', text: medico.nome },
            ],
          },
        ],
      });
      await logNotificacao({ consultaId, usuarioId: paciente.usuarioId, tipoEvento: 'CONSULTA_CANCELADA', ok });
    } catch (e) {
      logger.warn('whatsapp_cancel_paciente_error', { consultaId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  if (medico.telefone) {
    try {
      const ok = await enviarWhatsAppTemplate({
        para: medico.telefone,
        templateName: 'cancelamento_consulta',
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: medico.nome },
              { type: 'text', text: dataFormatada },
              { type: 'text', text: horaFormatada },
              { type: 'text', text: paciente.nome },
            ],
          },
        ],
      });
      await logNotificacao({ consultaId, usuarioId: medico.usuarioId, tipoEvento: 'CONSULTA_CANCELADA', ok });
    } catch (e) {
      logger.warn('whatsapp_cancel_medico_error', { consultaId, error: e instanceof Error ? e.message : String(e) });
    }
  }
}

/**
 * Template: lembrete_consulta
 * Parâmetros body: {{1}} nome paciente, {{2}} data, {{3}} hora, {{4}} nome profissional, {{5}} guia
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

  const dataFormatada = formatDate(data);
  const horaFormatada = formatTime(data);
  const guiaLabel = guia || consultaId.slice(0, 8);

  try {
    const ok = await enviarWhatsAppTemplate({
      para: paciente.telefone,
      templateName: 'lembrete_consulta',
      components: [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: paciente.nome },
            { type: 'text', text: dataFormatada },
            { type: 'text', text: horaFormatada },
            { type: 'text', text: medico.nome },
            { type: 'text', text: guiaLabel },
          ],
        },
      ],
    });
    await logNotificacao({ consultaId, usuarioId: paciente.usuarioId, tipoEvento: 'LEMBRETE_24H', ok });
  } catch (e) {
    logger.warn('whatsapp_reminder_error', { consultaId, error: e instanceof Error ? e.message : String(e) });
  }
}
