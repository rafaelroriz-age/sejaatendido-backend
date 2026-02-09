import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import {
  criarPagamentoCartaoSchema,
  criarPagamentoMercadoPagoCheckoutSchema,
  criarPagamentoPixSchema,
} from '../validators/schemas.js';
import Stripe from 'stripe';
import { ENV } from '../env.js';
import emailService from '../services/email.service.js';
import { enviarPushParaUsuario } from '../services/push.service.js';
import {
  createCheckoutPreference,
  fetchPayment,
  mapMpPaymentToStatus,
  mapMpPaymentTypeToMetodo,
  searchLatestPaymentByExternalReference,
  verifyMpWebhookSignature,
} from '../services/mercadopago.service.js';
import { logger } from '../logger/winston.js';

const r = Router();

// Inicializar Stripe (se configurado)
const stripe = ENV.STRIPE_SECRET_KEY ? new Stripe(ENV.STRIPE_SECRET_KEY) : null;

// =====================
// MERCADO PAGO (Checkout Pro)
// =====================

// Cria um checkout do Mercado Pago (PIX + crédito + débito no mesmo fluxo)
r.post(
  '/mercadopago/checkout',
  authMiddleware,
  requireRole('PACIENTE'),
  validate(criarPagamentoMercadoPagoCheckoutSchema),
  async (req: Request, res: Response) => {
    try {
      if (!ENV.MERCADOPAGO_ACCESS_TOKEN) {
        return res.status(503).json({ erro: 'Mercado Pago não configurado' });
      }

      const userId = req.userId!;
      const { consultaId, valorCentavos, backUrlSuccess, backUrlPending, backUrlFailure } = req.body;

      const paciente = await prisma.paciente.findUnique({ where: { usuarioId: userId }, include: { usuario: true } });
      if (!paciente) return res.status(404).json({ erro: 'Paciente não encontrado' });

      const consulta = await prisma.consulta.findUnique({
        where: { id: consultaId },
        include: { medico: { include: { usuario: true } } },
      });
      if (!consulta || consulta.pacienteId !== paciente.id) {
        return res.status(403).json({ erro: 'Consulta não encontrada ou sem permissão' });
      }

      if (consulta.status === 'CANCELADA' || consulta.status === 'CONCLUIDA') {
        return res.status(400).json({ erro: 'Não é possível pagar uma consulta cancelada/concluída' });
      }

      const pagamentoExistente = await prisma.pagamento.findUnique({ where: { consultaId } });
      if (pagamentoExistente) {
        return res.status(400).json({ erro: 'Já existe pagamento para esta consulta' });
      }

      const valor = valorCentavos || 15000;

      const pagamento = await prisma.pagamento.create({
        data: {
          consultaId,
          // Método real será inferido no webhook (pix/credit/debit). Mantém compatibilidade com enum atual.
          metodo: 'PIX',
          valorCentavos: valor,
          status: 'AGUARDANDO',
        },
      });

      const notificationUrl = `${ENV.BACKEND_URL.replace(/\/$/, '')}/pagamentos/webhook/mercadopago?source_news=webhooks`;
      const returnBase = `${ENV.BACKEND_URL.replace(/\/$/, '')}/pagamentos/mercadopago/retorno?pagamentoId=${encodeURIComponent(pagamento.id)}`;

      const pref = await createCheckoutPreference({
        pagamentoId: pagamento.id,
        title: `Consulta com Dr(a). ${consulta.medico.usuario.nome}`,
        unitPrice: Number((valor / 100).toFixed(2)),
        payerEmail: paciente.usuario.email,
        notificationUrl,
        backUrls: {
          success: backUrlSuccess || `${returnBase}&status=success`,
          failure: backUrlFailure || `${returnBase}&status=failure`,
          pending: backUrlPending || `${returnBase}&status=pending`,
        },
      });

      if (!pref.ok) {
        // Evita deixar registro órfão em caso de falha ao criar preference
        await prisma.pagamento.delete({ where: { id: pagamento.id } });
        return res.status(pref.status).json({ erro: pref.erro, detalhes: (pref as any).detalhes });
      }

      // Guarda preferenceId (em transacaoId) para depuração/relatórios
      await prisma.pagamento.update({ where: { id: pagamento.id }, data: { transacaoId: `MP_PREF_${pref.preference.id}` } });

      return res.status(201).json({
        pagamento,
        mercadopago: {
          preferenceId: pref.preference.id,
          initPoint: pref.preference.init_point,
          sandboxInitPoint: pref.preference.sandbox_init_point,
        },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ erro: 'Erro ao criar checkout Mercado Pago' });
    }
  }
);

// Endpoint de retorno do Checkout Pro (usado em back_urls)
r.get('/mercadopago/retorno', async (req: Request, res: Response) => {
  const pagamentoId = String(req.query.pagamentoId || '');
  const status = String(req.query.status || '');

  const deepLink = `sejaatendido://pagamento?pagamentoId=${encodeURIComponent(pagamentoId)}&status=${encodeURIComponent(status)}`;

  // HTML simples: tenta abrir o app, fallback para instruções.
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Pagamento</title>
  </head>
  <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 24px;">
    <h3>Pagamento: ${status || 'retorno'}</h3>
    <p>Você pode voltar para o app para ver o status.</p>
    <p><a href="${deepLink}">Abrir o app</a></p>
    <script>
      setTimeout(() => { window.location.href = ${JSON.stringify(deepLink)}; }, 300);
    </script>
  </body>
</html>`);
});

// Webhook Mercado Pago (topic: payment)
r.post('/webhook/mercadopago', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    if (!ENV.MERCADOPAGO_ACCESS_TOKEN) {
      return res.status(503).json({ erro: 'Mercado Pago não configurado' });
    }

    const bodyAny = req.body as any;
    const eventBodyId = bodyAny?.id != null ? String(bodyAny.id) : '';
    const eventType = bodyAny?.type != null ? String(bodyAny.type) : '';
    const eventAction = bodyAny?.action != null ? String(bodyAny.action) : '';

    logger.info('mp_webhook_received', {
      timestamp: new Date().toISOString(),
      bodyId: eventBodyId || undefined,
      type: eventType || undefined,
      action: eventAction || undefined,
      query: req.query,
      headers: {
        'x-request-id': typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined,
        'x-signature': typeof req.headers['x-signature'] === 'string' ? req.headers['x-signature'] : undefined,
      },
    });

    const queryDataId = typeof (req.query as any)['data.id'] === 'string' ? String((req.query as any)['data.id']) : '';
    const bodyDataId = String(bodyAny?.data?.id || '');
    const paymentId = queryDataId || bodyDataId;

    // Sem paymentId não dá para buscar detalhes; retorna 200 para evitar retries infinitos
    if (!paymentId) {
      return res.json({ received: true });
    }

    // Idempotência por evento (quando body.id não vier, usa paymentId como chave)
    const rawEventKey = eventBodyId || paymentId;
    const eventKey = `${eventType || 'payment'}:${rawEventKey}`;

    const jaProcessado = await prisma.mercadoPagoWebhookEvent.findUnique({ where: { eventId: eventKey } });
    if (jaProcessado?.processado) {
      logger.info('mp_webhook_already_processed', { eventId: eventKey, processadoEm: jaProcessado.processadoEm });
      return res.status(200).json({ message: 'Já processado' });
    }

    if (!jaProcessado) {
      try {
        await prisma.mercadoPagoWebhookEvent.create({
          data: {
            eventId: eventKey,
            type: eventType || null,
            action: eventAction || null,
            paymentId,
            processado: false,
          },
        });
      } catch {
        const existing = await prisma.mercadoPagoWebhookEvent.findUnique({ where: { eventId: eventKey } });
        if (existing?.processado) {
          logger.info('mp_webhook_already_processed', { eventId: eventKey, processadoEm: existing.processadoEm });
          return res.status(200).json({ message: 'Já processado' });
        }
      }
    }

    // Opcional: valida assinatura do webhook (se MERCADOPAGO_WEBHOOK_SECRET estiver configurado)
    const signatureCheck = verifyMpWebhookSignature({
      xSignature: typeof req.headers['x-signature'] === 'string' ? req.headers['x-signature'] : undefined,
      xRequestId: typeof req.headers['x-request-id'] === 'string' ? req.headers['x-request-id'] : undefined,
      dataId: paymentId,
    });
    if (!signatureCheck.ok) {
      await prisma.mercadoPagoWebhookEvent.updateMany({
        where: { eventId: eventKey },
        data: { processado: true, processadoEm: new Date() },
      });
      return res.status(signatureCheck.status).json({ erro: signatureCheck.erro });
    }

    const mp = await fetchPayment(paymentId);
    if (!mp.ok) {
      await prisma.mercadoPagoWebhookEvent.updateMany({
        where: { eventId: eventKey },
        data: { processado: true, processadoEm: new Date() },
      });
      return res.status(mp.status).json({ erro: mp.erro });
    }

    const payment = mp.payment;
    const externalRef = String(payment.external_reference || '');
    if (!externalRef) {
      await prisma.mercadoPagoWebhookEvent.updateMany({
        where: { eventId: eventKey },
        data: { processado: true, processadoEm: new Date() },
      });
      return res.json({ received: true });
    }

    const mapped = mapMpPaymentToStatus(payment.status);
    const metodo = mapMpPaymentTypeToMetodo(payment.payment_type_id);

    // Idempotência: só dispara ações na transição para PAGO
    const result = await prisma.$transaction(async (tx) => {
      const pagamento = await tx.pagamento.findUnique({ where: { id: externalRef } });
      if (!pagamento) return { ok: false as const, reason: 'not_found' as const };

      if (pagamento.status === 'PAGO') {
        return { ok: false as const, reason: 'already_paid' as const };
      }

      // Atualiza status
      const atualizado = await tx.pagamento.update({
        where: { id: pagamento.id },
        data: {
          status: mapped.pagamentoStatus,
          ...(metodo ? { metodo } : {}),
          // Guarda paymentId real (sobrescreve preferenceId)
          transacaoId: `MP_PAY_${String(payment.id)}`,
        },
      });

      if (atualizado.status !== 'PAGO') {
        return { ok: true as const, paid: false as const };
      }

      const consultaAtual = await tx.consulta.findUnique({ where: { id: atualizado.consultaId }, select: { id: true, status: true } });
      if (!consultaAtual) return { ok: true as const, paid: true as const, notify: false as const };

      if (consultaAtual.status === 'CANCELADA' || consultaAtual.status === 'CONCLUIDA') {
        // Não altera status nem notifica automaticamente: exige análise manual
        return { ok: true as const, paid: true as const, notify: false as const };
      }

      const consulta =
        consultaAtual.status === 'PENDENTE'
          ? await tx.consulta.update({
              where: { id: consultaAtual.id },
              data: { status: 'ACEITA' },
              include: {
                paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
                medico: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
              },
            })
          : await tx.consulta.findUnique({
              where: { id: consultaAtual.id },
              include: {
                paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
                medico: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
              },
            });

      return { ok: true as const, paid: true as const, notify: true as const, consulta, valorCentavos: atualizado.valorCentavos };
    });

    // Notificações fora da transação
    if ((result as any).notify && (result as any).consulta) {
      const consulta = (result as any).consulta as any;
      const valorCentavos = (result as any).valorCentavos as number;

      try {
        await emailService.enviarPagamentoConfirmado(
          consulta.paciente.usuario.email,
          consulta.paciente.usuario.nome,
          valorCentavos / 100,
          consulta.medico.usuario.nome,
          new Date(consulta.data)
        );

        await enviarPushParaUsuario({
          usuarioId: consulta.paciente.usuario.id,
          titulo: 'Pagamento confirmado',
          corpo: 'Seu pagamento foi confirmado',
          data: { tipo: 'PAGAMENTO_CONFIRMADO', consultaId: consulta.id },
        });
      } catch (e) {
        console.warn('Falha ao enviar notificações de pagamento (Mercado Pago):', e);
      }
    }

    await prisma.mercadoPagoWebhookEvent.updateMany({
      where: { eventId: eventKey },
      data: { processado: true, processadoEm: new Date() },
    });

    logger.info('mp_webhook_processed', {
      eventId: eventKey,
      paymentId,
      durationMs: Date.now() - startTime,
    });

    return res.json({ received: true });
  } catch (e) {
    logger.error('mp_webhook_error', { error: e instanceof Error ? { message: e.message, stack: e.stack } : e });
    return res.status(200).json({ received: true });
  }
});

// Endpoint de sincronização (fallback quando o webhook atrasa)
r.post('/mercadopago/:pagamentoId/sync', authMiddleware, requireRole('PACIENTE', 'ADMIN'), async (req: Request, res: Response) => {
  try {
    if (!ENV.MERCADOPAGO_ACCESS_TOKEN) {
      return res.status(503).json({ erro: 'Mercado Pago não configurado' });
    }

    const userId = req.userId!;
    const pagamentoId = String(req.params.pagamentoId || '');
    if (!pagamentoId) return res.status(400).json({ erro: 'pagamentoId inválido' });

    const pagamento = await prisma.pagamento.findUnique({
      where: { id: pagamentoId },
      include: {
        consulta: {
          include: {
            paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
            medico: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
          },
        },
      },
    });
    if (!pagamento) return res.status(404).json({ erro: 'Pagamento não encontrado' });

    if (req.userTipo !== 'ADMIN') {
      const paciente = await prisma.paciente.findUnique({ where: { usuarioId: userId } });
      if (!paciente) return res.status(404).json({ erro: 'Paciente não encontrado' });
      if (pagamento.consulta.pacienteId !== paciente.id) {
        return res.status(403).json({ erro: 'Sem permissão' });
      }
    }

    const mpSearch = await searchLatestPaymentByExternalReference(pagamento.id);
    if (!mpSearch.ok) {
      return res.status(mpSearch.status).json({ erro: mpSearch.erro });
    }

    if (!mpSearch.payment) {
      return res.status(200).json({ ok: true, found: false, pagamento });
    }

    const payment = mpSearch.payment;
    const mapped = mapMpPaymentToStatus(payment.status);
    const metodo = mapMpPaymentTypeToMetodo(payment.payment_type_id);

    const result = await prisma.$transaction(async (tx) => {
      const atual = await tx.pagamento.findUnique({ where: { id: pagamento.id } });
      if (!atual) return { ok: false as const, reason: 'not_found' as const };

      if (atual.status === 'PAGO') {
        return { ok: true as const, paid: true as const, notify: false as const };
      }

      const atualizado = await tx.pagamento.update({
        where: { id: atual.id },
        data: {
          status: mapped.pagamentoStatus,
          ...(metodo ? { metodo } : {}),
          transacaoId: `MP_PAY_${String(payment.id)}`,
        },
      });

      if (atualizado.status !== 'PAGO') {
        return { ok: true as const, paid: false as const, notify: false as const };
      }

      const consultaAtual = await tx.consulta.findUnique({ where: { id: atualizado.consultaId }, select: { id: true, status: true } });
      if (!consultaAtual) return { ok: true as const, paid: true as const, notify: false as const };

      if (consultaAtual.status === 'CANCELADA' || consultaAtual.status === 'CONCLUIDA') {
        return { ok: true as const, paid: true as const, notify: false as const };
      }

      const consulta =
        consultaAtual.status === 'PENDENTE'
          ? await tx.consulta.update({
              where: { id: consultaAtual.id },
              data: { status: 'ACEITA' },
              include: {
                paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
                medico: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
              },
            })
          : await tx.consulta.findUnique({
              where: { id: consultaAtual.id },
              include: {
                paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
                medico: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
              },
            });

      return { ok: true as const, paid: true as const, notify: true as const, consulta, valorCentavos: atualizado.valorCentavos };
    });

    if ((result as any).notify && (result as any).consulta) {
      const consulta = (result as any).consulta as any;
      const valorCentavos = (result as any).valorCentavos as number;

      try {
        await emailService.enviarPagamentoConfirmado(
          consulta.paciente.usuario.email,
          consulta.paciente.usuario.nome,
          valorCentavos / 100,
          consulta.medico.usuario.nome,
          new Date(consulta.data)
        );

        await enviarPushParaUsuario({
          usuarioId: consulta.paciente.usuario.id,
          titulo: 'Pagamento confirmado',
          corpo: 'Seu pagamento foi confirmado',
          data: { tipo: 'PAGAMENTO_CONFIRMADO', consultaId: consulta.id },
        });
      } catch (e) {
        console.warn('Falha ao enviar notificações de pagamento (Mercado Pago/sync):', e);
      }
    }

    const refreshed = await prisma.pagamento.findUnique({ where: { id: pagamento.id } });
    return res.status(200).json({ ok: true, found: true, pagamento: refreshed });
  } catch (e) {
    console.error('Mercado Pago sync error:', e);
    return res.status(500).json({ erro: 'Erro ao sincronizar pagamento Mercado Pago' });
  }
});

// =====================
// CRIAR PAGAMENTO
// =====================

// Criar pagamento PIX
r.post('/pix', authMiddleware, requireRole('PACIENTE'), validate(criarPagamentoPixSchema), async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { consultaId, valorCentavos } = req.body;

    // Verificar se paciente existe
    const paciente = await prisma.paciente.findUnique({
      where: { usuarioId: userId },
    });

    if (!paciente) {
      return res.status(404).json({ erro: 'Paciente não encontrado' });
    }

    // Verificar se consulta existe e pertence ao paciente
    const consulta = await prisma.consulta.findUnique({
      where: { id: consultaId },
    });

    if (!consulta || consulta.pacienteId !== paciente.id) {
      return res.status(403).json({ erro: 'Consulta não encontrada ou sem permissão' });
    }

    // Verificar se já existe pagamento
    const pagamentoExistente = await prisma.pagamento.findUnique({
      where: { consultaId },
    });

    if (pagamentoExistente) {
      return res.status(400).json({ erro: 'Já existe pagamento para esta consulta' });
    }

    // Criar pagamento
    const pagamento = await prisma.pagamento.create({
      data: {
        consultaId,
        metodo: 'PIX',
        valorCentavos: valorCentavos || 15000, // R$ 150,00 padrão
        status: 'AGUARDANDO',
      },
    });

    // Gerar código PIX simulado (em produção usar API do banco)
    const pixCode = `00020126580014br.gov.bcb.pix0136${pagamento.id}5204000053039865802BR5913SEJAATENDIDO6008SAOPAULO62070503***6304`;

    res.status(201).json({
      pagamento,
      pix: {
        codigo: pixCode,
        qrcode: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixCode)}`,
        validade: new Date(Date.now() + 30 * 60 * 1000), // 30 minutos
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao criar pagamento PIX' });
  }
});

// =====================
// MERCADO PAGO CHECKOUT (PIX + CARTÕES via WebView)
// =====================
// Criar pagamento Cartão (Stripe)
r.post(
  '/cartao',
  authMiddleware,
  requireRole('PACIENTE'),
  validate(criarPagamentoCartaoSchema),
  async (req: Request, res: Response) => {
  try {
    if (!stripe) {
      return res.status(503).json({ erro: 'Pagamento com cartão não configurado' });
    }

    const userId = req.userId!;
    const { consultaId, valorCentavos } = req.body;

    // Verificar se paciente existe
    const paciente = await prisma.paciente.findUnique({
      where: { usuarioId: userId },
      include: { usuario: true },
    });

    if (!paciente) {
      return res.status(404).json({ erro: 'Paciente não encontrado' });
    }

    // Verificar se consulta existe e pertence ao paciente
    const consulta = await prisma.consulta.findUnique({
      where: { id: consultaId },
      include: {
        medico: {
          include: { usuario: true },
        },
      },
    });

    if (!consulta || consulta.pacienteId !== paciente.id) {
      return res.status(403).json({ erro: 'Consulta não encontrada ou sem permissão' });
    }

    // Verificar se já existe pagamento
    const pagamentoExistente = await prisma.pagamento.findUnique({
      where: { consultaId },
    });

    if (pagamentoExistente) {
      return res.status(400).json({ erro: 'Já existe pagamento para esta consulta' });
    }

    const valor = valorCentavos || 15000;

    // Criar PaymentIntent no Stripe
    const paymentIntent = await stripe.paymentIntents.create({
      amount: valor,
      currency: 'brl',
      metadata: {
        consultaId,
        pacienteId: paciente.id,
        medicoId: consulta.medicoId,
      },
      description: `Consulta com Dr(a). ${consulta.medico.usuario.nome}`,
    });

    // Criar pagamento no banco
    const pagamento = await prisma.pagamento.create({
      data: {
        consultaId,
        metodo: 'CARTAO',
        valorCentavos: valor,
        status: 'AGUARDANDO',
        transacaoId: paymentIntent.id,
      },
    });

    res.status(201).json({
      pagamento,
      stripe: {
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao criar pagamento com cartão' });
  }
  }
);

// =====================
// WEBHOOK STRIPE
// =====================

r.post('/webhook/stripe', async (req: Request, res: Response) => {
  try {
    if (!stripe) {
      return res.status(503).json({ erro: 'Stripe não configurado' });
    }

    const sig = req.headers['stripe-signature'] as string;
    const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event: Stripe.Event;

    if (endpointSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } else {
      event = req.body as Stripe.Event;
    }

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object as Stripe.PaymentIntent;

        // Idempotência real: só processa se ainda não estiver PAGO
        const processed = await prisma.$transaction(async (tx) => {
          const pagamento = await tx.pagamento.findFirst({
            where: { transacaoId: paymentIntent.id },
            select: { id: true, status: true, consultaId: true, valorCentavos: true },
          });

          if (!pagamento) return { ok: false as const, reason: 'not_found' as const };
          if (pagamento.status === 'PAGO') return { ok: false as const, reason: 'already_paid' as const };

          await tx.pagamento.update({
            where: { id: pagamento.id },
            data: { status: 'PAGO' },
          });

          // Só muda consulta para ACEITA se ela ainda estiver PENDENTE
          const consultaAtual = await tx.consulta.findUnique({
            where: { id: pagamento.consultaId },
            select: { id: true, status: true },
          });

          const shouldAccept = consultaAtual?.status === 'PENDENTE';

          const consulta = shouldAccept
            ? await tx.consulta.update({
                where: { id: pagamento.consultaId },
                data: { status: 'ACEITA' },
                include: {
                  paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
                  medico: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
                },
              })
            : await tx.consulta.findUnique({
                where: { id: pagamento.consultaId },
                include: {
                  paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
                  medico: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
                },
              });

          return {
            ok: true as const,
            consulta,
            valorCentavos: pagamento.valorCentavos,
          };
        });

        // Notificações apenas na primeira confirmação (evita duplicar em retries do Stripe)
        if (processed.ok && processed.consulta) {
          try {
            await emailService.enviarPagamentoConfirmado(
              processed.consulta.paciente.usuario.email,
              processed.consulta.paciente.usuario.nome,
              processed.valorCentavos / 100,
              processed.consulta.medico.usuario.nome,
              new Date(processed.consulta.data)
            );

            await enviarPushParaUsuario({
              usuarioId: processed.consulta.paciente.usuario.id,
              titulo: 'Pagamento confirmado',
              corpo: 'Seu pagamento foi confirmado',
              data: { tipo: 'PAGAMENTO_CONFIRMADO', consultaId: processed.consulta.id },
            });
          } catch (e) {
            console.warn('Falha ao enviar notificações de pagamento (Stripe):', e);
          }
        }

        break;
      }

      case 'payment_intent.payment_failed': {
        const failedIntent = event.data.object as Stripe.PaymentIntent;
        // Não sobrescreve PAGO
        await prisma.pagamento.updateMany({
          where: { transacaoId: failedIntent.id, status: { not: 'PAGO' } },
          data: { status: 'FALHOU' },
        });
        break;
      }
    }

    res.json({ received: true });
  } catch (e) {
    console.error('Webhook error:', e);
    res.status(400).json({ erro: 'Webhook error' });
  }
});

// =====================
// CONFIRMAR PAGAMENTO PIX (simulação)
// =====================

r.post('/pix/:pagamentoId/confirmar', authMiddleware, requireRole('ADMIN'), async (req: Request, res: Response) => {
  try {
    const { pagamentoId } = req.params;

    const pagamento = await prisma.pagamento.findUnique({
      where: { id: pagamentoId },
    });

    if (!pagamento) {
      return res.status(404).json({ erro: 'Pagamento não encontrado' });
    }

    if (pagamento.status === 'PAGO') {
      return res.status(400).json({ erro: 'Pagamento já confirmado' });
    }

    const consultaAtual = await prisma.consulta.findUnique({
      where: { id: pagamento.consultaId },
      select: { id: true, status: true },
    });

    if (!consultaAtual) {
      return res.status(404).json({ erro: 'Consulta não encontrada' });
    }

    if (consultaAtual.status === 'CANCELADA' || consultaAtual.status === 'CONCLUIDA') {
      return res.status(400).json({ erro: 'Não é possível confirmar pagamento para consulta cancelada/concluída' });
    }

    const atualizado = await prisma.pagamento.update({
      where: { id: pagamentoId },
      data: {
        status: 'PAGO',
        transacaoId: `PIX_${Date.now()}`,
      },
    });

    // Atualizar status da consulta apenas se ainda estiver PENDENTE
    const consulta =
      consultaAtual.status === 'PENDENTE'
        ? await prisma.consulta.update({
            where: { id: pagamento.consultaId },
            data: { status: 'ACEITA' },
            include: {
              paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
              medico: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
            },
          })
        : await prisma.consulta.findUnique({
            where: { id: pagamento.consultaId },
            include: {
              paciente: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
              medico: { include: { usuario: { select: { id: true, nome: true, email: true } } } },
            },
          });

    // Notificações (best-effort)
    try {
      await emailService.enviarPagamentoConfirmado(
        consulta.paciente.usuario.email,
        consulta.paciente.usuario.nome,
        atualizado.valorCentavos / 100,
        consulta.medico.usuario.nome,
        new Date(consulta.data)
      );

      await enviarPushParaUsuario({
        usuarioId: consulta.paciente.usuario.id,
        titulo: 'Pagamento confirmado',
        corpo: 'Seu pagamento foi confirmado',
        data: { tipo: 'PAGAMENTO_CONFIRMADO', consultaId: consulta.id },
      });
    } catch (e) {
      console.warn('Falha ao enviar notificações de pagamento (PIX):', e);
    }

    res.json({ mensagem: 'Pagamento confirmado', pagamento: atualizado });
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao confirmar pagamento' });
  }
});

// =====================
// CONSULTAR STATUS DO PAGAMENTO
// =====================

r.get('/:pagamentoId', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { pagamentoId } = req.params;
    const userId = req.userId!;
    const userTipo = req.userTipo!;

    const pagamento = await prisma.pagamento.findUnique({
      where: { id: pagamentoId },
      include: {
        consulta: {
          include: {
            medico: {
              include: {
                usuario: {
                  select: { id: true, nome: true },
                },
              },
            },
            paciente: {
              include: {
                usuario: {
                  select: { id: true, nome: true },
                },
              },
            },
          },
        },
      },
    });

    if (!pagamento) {
      return res.status(404).json({ erro: 'Pagamento não encontrado' });
    }

    // Controle de acesso: admin OU participante da consulta
    if (userTipo !== 'ADMIN') {
      const medicoUsuarioId = pagamento.consulta.medico.usuario.id;
      const pacienteUsuarioId = pagamento.consulta.paciente.usuario.id;
      const isOwner = userId === medicoUsuarioId || userId === pacienteUsuarioId;
      if (!isOwner) {
        return res.status(403).json({ erro: 'Sem permissão para acessar este pagamento' });
      }
    }

    res.json(pagamento);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: 'Erro ao buscar pagamento' });
  }
});

export default r;