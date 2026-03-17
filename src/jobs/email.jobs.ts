import cron from 'node-cron';
import { prisma } from '../utils/prisma.js';
import emailService from '../services/email.service.js';
import { enviarPushParaUsuario } from '../services/push.service.js';
import { notificarEmail, notificarPush, notificarWhatsApp } from '../services/notification.service.js';
import { moverSaldoParaLiberar, processarRepassesSemanal } from '../services/saldo.service.js';
import { createPixPayout } from '../services/mercadopago.service.js';
import { ENV } from '../env.js';
import { logger } from '../logger/winston.js';

type JobResult = {
  ok: boolean;
  intervalo?: { inicio: string; fim: string };
  consultasProcessadas: number;
  emailsEnviados: number;
  pushEnviados: number;
};

type ConcludeResult = {
  ok: boolean;
  cutoff: string;
  atualizadas: number;
};

const running: Record<string, boolean> = {};

async function withLock<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  if (running[name]) return null;
  running[name] = true;
  try {
    return await fn();
  } finally {
    running[name] = false;
  }
}

export async function runDailyReminders(): Promise<JobResult> {
  const now = new Date();
  const inicio = new Date(now);
  inicio.setDate(inicio.getDate() + 1);
  inicio.setHours(0, 0, 0, 0);

  const fim = new Date(inicio);
  fim.setHours(23, 59, 59, 999);

  const consultas = await prisma.consulta.findMany({
    where: {
      status: 'ACEITA',
      lembreteDiarioEnviado: false,
      data: { gte: inicio, lte: fim },
    },
    include: {
      paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
      medico: { include: { usuario: { select: { id: true, nome: true } } } },
    },
  });

  let emailsEnviados = 0;
  let pushEnviados = 0;

  for (const c of consultas) {
    let sentAny = false;

    try {
      const r = await notificarEmail({
        consultaId: c.id,
        usuarioId: c.paciente.usuario.id,
        tipoEvento: 'LEMBRETE_24H',
        enviar: () =>
          emailService.enviarLembreteConsulta(
            c.paciente.usuario.email,
            c.paciente.usuario.nome,
            c.medico.usuario.nome,
            new Date(c.data),
            c.meetLink || undefined,
          ),
      });
      if (r.ok) {
        emailsEnviados += 1;
        sentAny = true;
      }
    } catch (e) {
      console.warn('Falha ao enviar lembrete diário (email)');
    }

    try {
      const r = await notificarPush({
        consultaId: c.id,
        usuarioId: c.paciente.usuario.id,
        tipoEvento: 'LEMBRETE_24H',
        titulo: 'Lembrete de consulta',
        corpo: 'Sua consulta é amanhã',
        data: { tipo: 'LEMBRETE_CONSULTA', consultaId: c.id },
      });
      if (r.ok) {
        pushEnviados += 1;
        sentAny = true;
      }
    } catch (e) {
      console.warn('Falha ao enviar lembrete diário (push)');
    }

    if (sentAny) {
      try {
        await prisma.consulta.update({
          where: { id: c.id },
          data: { lembreteDiarioEnviado: true },
        });
      } catch {
        // best-effort
      }
    }
  }

  return {
    ok: true,
    intervalo: { inicio: inicio.toISOString(), fim: fim.toISOString() },
    consultasProcessadas: consultas.length,
    emailsEnviados,
    pushEnviados,
  };
}

export async function run15MinReminders(): Promise<JobResult> {
  const now = new Date();
  const inicio = new Date(now.getTime() + 10 * 60 * 1000);
  const fim = new Date(now.getTime() + 20 * 60 * 1000);

  const consultas = await prisma.consulta.findMany({
    where: {
      status: 'ACEITA',
      lembrete15mEnviado: false,
      data: { gte: inicio, lte: fim },
    },
    include: {
      paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
      medico: { include: { usuario: { select: { id: true, nome: true } } } },
    },
  });

  let emailsEnviados = 0;
  let pushEnviados = 0;

  for (const c of consultas) {
    let sentAny = false;

    try {
      const r = await notificarEmail({
        consultaId: c.id,
        usuarioId: c.paciente.usuario.id,
        tipoEvento: 'LEMBRETE_1H',
        enviar: () =>
          emailService.enviarLembrete15MinAntes(
            c.paciente.usuario.email,
            c.paciente.usuario.nome,
            c.medico.usuario.nome,
            new Date(c.data),
            c.meetLink || undefined,
          ),
      });
      if (r.ok) {
        emailsEnviados += 1;
        sentAny = true;
      }
    } catch {
      console.warn('Falha ao enviar lembrete 15m (email)');
    }

    try {
      const r = await notificarPush({
        consultaId: c.id,
        usuarioId: c.paciente.usuario.id,
        tipoEvento: 'LEMBRETE_1H',
        titulo: 'Consulta em 15 minutos',
        corpo: 'Sua consulta começa em breve',
        data: { tipo: 'LEMBRETE_15M', consultaId: c.id },
      });
      if (r.ok) {
        pushEnviados += 1;
        sentAny = true;
      }
    } catch {
      console.warn('Falha ao enviar lembrete 15m (push)');
    }

    if (sentAny) {
      try {
        await prisma.consulta.update({
          where: { id: c.id },
          data: { lembrete15mEnviado: true },
        });
      } catch {
        // best-effort
      }
    }
  }

  return {
    ok: true,
    intervalo: { inicio: inicio.toISOString(), fim: fim.toISOString() },
    consultasProcessadas: consultas.length,
    emailsEnviados,
    pushEnviados,
  };
}

export async function runRatingEmails(): Promise<JobResult> {
  const now = new Date();
  const minStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const latestStart = new Date(now.getTime() - (ENV.CONSULTA_DURACAO_MINUTOS + 60) * 60 * 1000);

  const consultas = await prisma.consulta.findMany({
    where: {
      emailAvaliacaoEnviado: false,
      status: 'CONCLUIDA',
      data: { gte: minStart, lte: latestStart },
    },
    include: {
      paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
      medico: { include: { usuario: { select: { id: true, nome: true } } } },
    },
  });

  let emailsEnviados = 0;
  let pushEnviados = 0;

  for (const c of consultas) {
    let sentAny = false;

    const link = `${ENV.FRONTEND_URL}/avaliacao?consultaId=${encodeURIComponent(c.id)}`;

    try {
      const r = await notificarEmail({
        consultaId: c.id,
        usuarioId: c.paciente.usuario.id,
        tipoEvento: 'AVALIACAO_SOLICITADA',
        enviar: () =>
          emailService.enviarSolicitacaoAvaliacao(
            c.paciente.usuario.email,
            c.paciente.usuario.nome,
            c.medico.usuario.nome,
            new Date(c.data),
            link,
          ),
      });
      if (r.ok) {
        emailsEnviados += 1;
        sentAny = true;
      }
    } catch {
      console.warn('Falha ao enviar avaliação (email)');
    }

    try {
      const r = await notificarPush({
        consultaId: c.id,
        usuarioId: c.paciente.usuario.id,
        tipoEvento: 'AVALIACAO_SOLICITADA',
        titulo: 'Avalie sua consulta',
        corpo: 'Sua opinião é importante. Avalie agora.',
        data: { tipo: 'AVALIACAO', consultaId: c.id },
      });
      if (r.ok) {
        pushEnviados += 1;
        sentAny = true;
      }
    } catch {
      console.warn('Falha ao enviar avaliação (push)');
    }

    if (sentAny) {
      try {
        await prisma.consulta.update({
          where: { id: c.id },
          data: { emailAvaliacaoEnviado: true },
        });
      } catch {
        // best-effort
      }
    }
  }

  return {
    ok: true,
    intervalo: { inicio: minStart.toISOString(), fim: latestStart.toISOString() },
    consultasProcessadas: consultas.length,
    emailsEnviados,
    pushEnviados,
  };
}

export async function runAutoConcludeConsultations(): Promise<ConcludeResult> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - ENV.CONSULTA_DURACAO_MINUTOS * 60 * 1000);

  const r = await prisma.consulta.updateMany({
    where: {
      status: 'ACEITA',
      data: { lte: cutoff },
    },
    data: {
      status: 'CONCLUIDA',
    },
  });

  return { ok: true, cutoff: cutoff.toISOString(), atualizadas: r.count };
}

export function startEmailJobs() {
  if (!ENV.ENABLE_EMAIL_JOBS) return;

  // Marca consultas como CONCLUIDA após término estimado
  cron.schedule('*/10 * * * *', () => {
    void withLock('concluirConsultas', async () => {
      await runAutoConcludeConsultations();
      return true;
    });
  });

  // 15 min antes (a cada 5 min)
  cron.schedule('*/5 * * * *', () => {
    void withLock('lembrete15m', run15MinReminders);
  });

  // Diário às 09:00
  cron.schedule('0 9 * * *', () => {
    void withLock('lembreteDiario', runDailyReminders);
  });

  // Avaliação (a cada 15 min)
  cron.schedule('*/15 * * * *', () => {
    void withLock('avaliacao', runRatingEmails);
  });

  // =====================
  // REPASSES SEMANAIS
  // =====================

  // Domingo 23:59 — consolida saldo pendente → a liberar, cria ciclo
  cron.schedule('59 23 * * 0', () => {
    void withLock('moverSaldo', async () => {
      logger.info('cron_mover_saldo_inicio');
      const r = await moverSaldoParaLiberar();
      logger.info('cron_mover_saldo_fim', r);
      return r;
    });
  });

  // Segunda 08:00 — processa pagamentos automáticos via MP Pix
  cron.schedule('0 8 * * 1', () => {
    void withLock('processarRepasses', async () => {
      logger.info('cron_processar_repasses_inicio');
      const r = await processarRepassesSemanal(async (params) => {
        const medico = await prisma.medico.findUnique({
          where: { id: params.medicoId },
          select: { tipoChavePix: true, valorChavePix: true },
        });
        if (!medico?.tipoChavePix || !medico?.valorChavePix) {
          return { ok: false, erro: 'Médico sem chave Pix' };
        }
        const result = await createPixPayout({
          amount: params.valorCentavos,
          pixKeyType: medico.tipoChavePix,
          pixKeyValue: medico.valorChavePix,
          description: `SejaAtendido - Repasse semanal`,
          externalReference: params.cicloId,
        });
        return {
          ok: result.ok,
          mpPaymentId: result.ok ? result.mpPaymentId : undefined,
          erro: result.ok ? undefined : result.erro,
        };
      });
      logger.info('cron_processar_repasses_fim', r);
      return r;
    });
  });
}
