import { prisma } from '../utils/prisma.js';
import emailService from './email.service.js';
import { enviarPushParaUsuario } from './push.service.js';
import { enviarWhatsApp } from './whatsapp.service.js';
import { logger } from '../logger/winston.js';

type Canal = 'EMAIL' | 'PUSH' | 'WHATSAPP';

interface NotificacaoResult {
  canal: Canal;
  ok: boolean;
}

async function logNotificacao(params: {
  consultaId?: string;
  usuarioId: string;
  canal: Canal;
  tipoEvento: string;
  ok: boolean;
}) {
  try {
    await prisma.notificacaoLog.create({
      data: {
        consultaId: params.consultaId || null,
        usuarioId: params.usuarioId,
        canal: params.canal,
        tipoEvento: params.tipoEvento,
        status: params.ok ? 'ENVIADO' : 'FALHOU',
      },
    });
  } catch (e) {
    logger.warn('notificacao_log_failed', { error: e instanceof Error ? e.message : String(e) });
  }
}

/** Envia notificação por email e registra no log */
export async function notificarEmail(params: {
  consultaId?: string;
  usuarioId: string;
  tipoEvento: string;
  enviar: () => Promise<boolean | void>;
}): Promise<NotificacaoResult> {
  let ok = false;
  try {
    const result = await params.enviar();
    ok = result !== false;
  } catch (e) {
    logger.warn('notificacao_email_failed', { error: e instanceof Error ? e.message : String(e) });
  }
  await logNotificacao({ ...params, canal: 'EMAIL', ok });
  return { canal: 'EMAIL', ok };
}

/** Envia push notification e registra no log */
export async function notificarPush(params: {
  consultaId?: string;
  usuarioId: string;
  tipoEvento: string;
  titulo: string;
  corpo: string;
  data?: Record<string, string>;
}): Promise<NotificacaoResult> {
  let ok = false;
  try {
    const result = await enviarPushParaUsuario({
      usuarioId: params.usuarioId,
      titulo: params.titulo,
      corpo: params.corpo,
      data: params.data,
    });
    ok = result.ok && result.enviado > 0;
  } catch (e) {
    logger.warn('notificacao_push_failed', { error: e instanceof Error ? e.message : String(e) });
  }
  await logNotificacao({ ...params, canal: 'PUSH', ok });
  return { canal: 'PUSH', ok };
}

/** Envia WhatsApp e registra no log */
export async function notificarWhatsApp(params: {
  consultaId?: string;
  usuarioId: string;
  tipoEvento: string;
  telefone: string;
  mensagem: string;
}): Promise<NotificacaoResult> {
  let ok = false;
  try {
    ok = await enviarWhatsApp({ para: params.telefone, mensagem: params.mensagem });
  } catch (e) {
    logger.warn('notificacao_whatsapp_failed', { error: e instanceof Error ? e.message : String(e) });
  }
  await logNotificacao({ ...params, canal: 'WHATSAPP', ok });
  return { canal: 'WHATSAPP', ok };
}

// =====================
// DISPATCHERS POR EVENTO
// =====================

/** Consulta agendada → notifica paciente e médico (email + push) */
export async function dispararConsultaAgendada(params: {
  consultaId: string;
  paciente: { usuarioId: string; nome: string; email: string };
  medico: { usuarioId: string; nome: string; email: string };
  especialidade: string;
  data: Date;
  motivo: string;
}): Promise<NotificacaoResult[]> {
  const results: NotificacaoResult[] = [];

  // Email paciente
  results.push(
    await notificarEmail({
      consultaId: params.consultaId,
      usuarioId: params.paciente.usuarioId,
      tipoEvento: 'CONSULTA_AGENDADA',
      enviar: () =>
        emailService.enviarConsultaAgendada(
          params.paciente.email,
          params.paciente.nome,
          params.medico.nome,
          params.especialidade,
          params.data,
          params.motivo,
        ),
    }),
  );

  // Email médico
  results.push(
    await notificarEmail({
      consultaId: params.consultaId,
      usuarioId: params.medico.usuarioId,
      tipoEvento: 'CONSULTA_AGENDADA',
      enviar: () =>
        emailService.enviarNovaConsultaMedico(
          params.medico.email,
          params.medico.nome,
          params.paciente.nome,
          params.data,
          params.motivo,
        ),
    }),
  );

  // Push paciente
  results.push(
    await notificarPush({
      consultaId: params.consultaId,
      usuarioId: params.paciente.usuarioId,
      tipoEvento: 'CONSULTA_AGENDADA',
      titulo: 'Consulta agendada',
      corpo: `Sua consulta com Dr(a). ${params.medico.nome} foi agendada`,
      data: { tipo: 'CONSULTA_AGENDADA', consultaId: params.consultaId },
    }),
  );

  // Push médico
  results.push(
    await notificarPush({
      consultaId: params.consultaId,
      usuarioId: params.medico.usuarioId,
      tipoEvento: 'CONSULTA_AGENDADA',
      titulo: 'Nova consulta',
      corpo: `Nova consulta agendada com ${params.paciente.nome}`,
      data: { tipo: 'CONSULTA_AGENDADA', consultaId: params.consultaId },
    }),
  );

  return results;
}

/** Consulta cancelada → notifica paciente e médico (email + push) */
export async function dispararConsultaCancelada(params: {
  consultaId: string;
  paciente: { usuarioId: string; nome: string; email: string };
  medico: { usuarioId: string; nome: string; email: string };
  data: Date;
}): Promise<NotificacaoResult[]> {
  const results: NotificacaoResult[] = [];

  // Email paciente
  results.push(
    await notificarEmail({
      consultaId: params.consultaId,
      usuarioId: params.paciente.usuarioId,
      tipoEvento: 'CONSULTA_CANCELADA',
      enviar: () =>
        emailService.enviarConsultaCancelada(
          params.paciente.email,
          params.paciente.nome,
          params.medico.nome,
          params.data,
        ),
    }),
  );

  // Push paciente
  results.push(
    await notificarPush({
      consultaId: params.consultaId,
      usuarioId: params.paciente.usuarioId,
      tipoEvento: 'CONSULTA_CANCELADA',
      titulo: 'Consulta cancelada',
      corpo: `Sua consulta com Dr(a). ${params.medico.nome} foi cancelada`,
      data: { tipo: 'CONSULTA_CANCELADA', consultaId: params.consultaId },
    }),
  );

  // Push médico
  results.push(
    await notificarPush({
      consultaId: params.consultaId,
      usuarioId: params.medico.usuarioId,
      tipoEvento: 'CONSULTA_CANCELADA',
      titulo: 'Consulta cancelada',
      corpo: `Consulta com ${params.paciente.nome} foi cancelada`,
      data: { tipo: 'CONSULTA_CANCELADA', consultaId: params.consultaId },
    }),
  );

  return results;
}

/** Pagamento confirmado → notifica paciente (email + push) */
export async function dispararPagamentoConfirmado(params: {
  consultaId: string;
  paciente: { usuarioId: string; nome: string; email: string };
  medicoNome: string;
  valorCentavos: number;
  data: Date;
}): Promise<NotificacaoResult[]> {
  const results: NotificacaoResult[] = [];

  results.push(
    await notificarEmail({
      consultaId: params.consultaId,
      usuarioId: params.paciente.usuarioId,
      tipoEvento: 'PAGAMENTO_CONFIRMADO',
      enviar: () =>
        emailService.enviarPagamentoConfirmado(
          params.paciente.email,
          params.paciente.nome,
          params.valorCentavos / 100,
          params.medicoNome,
          params.data,
        ),
    }),
  );

  results.push(
    await notificarPush({
      consultaId: params.consultaId,
      usuarioId: params.paciente.usuarioId,
      tipoEvento: 'PAGAMENTO_CONFIRMADO',
      titulo: 'Pagamento confirmado',
      corpo: 'Seu pagamento foi confirmado',
      data: { tipo: 'PAGAMENTO_CONFIRMADO', consultaId: params.consultaId },
    }),
  );

  return results;
}
