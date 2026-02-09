import crypto from 'node:crypto';
import { ENV } from '../env.js';

type MercadoPagoPreferenceResponse = {
  id: string;
  init_point?: string;
  sandbox_init_point?: string;
};

type MercadoPagoPaymentSearchResponse = {
  results?: MercadoPagoPayment[];
};

export type MercadoPagoPayment = {
  id: number;
  status?: string;
  status_detail?: string;
  payment_type_id?: string;
  payment_method_id?: string;
  external_reference?: string;
  transaction_amount?: number;
  currency_id?: string;
  date_created?: string;
  date_approved?: string;
};

export async function createCheckoutPreference(params: {
  pagamentoId: string;
  title: string;
  unitPrice: number;
  payerEmail?: string;
  notificationUrl: string;
  backUrls?: {
    success?: string;
    pending?: string;
    failure?: string;
  };
}) {
  if (!ENV.MERCADOPAGO_ACCESS_TOKEN) {
    return { ok: false as const, status: 503 as const, erro: 'Mercado Pago não configurado' };
  }

  const hasBackUrls =
    !!params.backUrls && !!(params.backUrls.success || params.backUrls.pending || params.backUrls.failure);

  const resp = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ENV.MERCADOPAGO_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      external_reference: params.pagamentoId,
      notification_url: params.notificationUrl,
      binary_mode: true,
      ...(hasBackUrls
        ? {
            back_urls: {
              ...(params.backUrls?.success ? { success: params.backUrls.success } : {}),
              ...(params.backUrls?.pending ? { pending: params.backUrls.pending } : {}),
              ...(params.backUrls?.failure ? { failure: params.backUrls.failure } : {}),
            },
            auto_return: params.backUrls?.success ? 'approved' : undefined,
          }
        : {}),
      ...(params.payerEmail ? { payer: { email: params.payerEmail } } : {}),
      items: [
        {
          title: params.title,
          quantity: 1,
          currency_id: 'BRL',
          unit_price: params.unitPrice,
        },
      ],
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false as const, status: 502 as const, erro: `Erro Mercado Pago (preference): ${text || resp.status}` };
  }

  const data = (await resp.json()) as MercadoPagoPreferenceResponse;
  if (!data?.id) {
    return { ok: false as const, status: 502 as const, erro: 'Resposta inválida do Mercado Pago (preference)' };
  }

  return { ok: true as const, preference: data };
}

export async function fetchPayment(paymentId: string) {
  if (!ENV.MERCADOPAGO_ACCESS_TOKEN) {
    return { ok: false as const, status: 503 as const, erro: 'Mercado Pago não configurado' };
  }

  const resp = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${ENV.MERCADOPAGO_ACCESS_TOKEN}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false as const, status: 502 as const, erro: `Erro Mercado Pago (payment): ${text || resp.status}` };
  }

  const data = (await resp.json()) as MercadoPagoPayment;
  if (!data?.id) {
    return { ok: false as const, status: 502 as const, erro: 'Resposta inválida do Mercado Pago (payment)' };
  }

  return { ok: true as const, payment: data };
}

export async function searchLatestPaymentByExternalReference(externalReference: string) {
  if (!ENV.MERCADOPAGO_ACCESS_TOKEN) {
    return { ok: false as const, status: 503 as const, erro: 'Mercado Pago não configurado' };
  }

  const url = new URL('https://api.mercadopago.com/v1/payments/search');
  url.searchParams.set('external_reference', externalReference);
  url.searchParams.set('sort', 'date_created');
  url.searchParams.set('criteria', 'desc');
  url.searchParams.set('limit', '1');

  const resp = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${ENV.MERCADOPAGO_ACCESS_TOKEN}`,
    },
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    return { ok: false as const, status: 502 as const, erro: `Erro Mercado Pago (search): ${text || resp.status}` };
  }

  const data = (await resp.json()) as MercadoPagoPaymentSearchResponse;
  const payment = Array.isArray(data?.results) && data.results.length > 0 ? data.results[0] : undefined;
  return { ok: true as const, payment };
}

// Webhook signature validation (optional)
// If MERCADOPAGO_WEBHOOK_SECRET isn't configured, validation is skipped.
export function verifyMpWebhookSignature(params: {
  xSignature?: string;
  xRequestId?: string;
  dataId?: string;
  tsToleranceSeconds?: number;
}) {
  if (!ENV.MERCADOPAGO_WEBHOOK_SECRET) {
    return { ok: true as const, skipped: true as const };
  }

  const xSignature = params.xSignature || '';
  const xRequestId = params.xRequestId || '';
  const dataId = String(params.dataId || '');

  if (!xSignature || !xRequestId || !dataId) {
    return {
      ok: false as const,
      status: 400 as const,
      erro: 'Assinatura ausente (x-signature/x-request-id) ou data.id ausente',
    };
  }

  const parts = xSignature.split(',').map((p) => p.trim());
  let ts = '';
  let v1 = '';
  for (const part of parts) {
    const [k, ...rest] = part.split('=');
    const value = rest.join('=').trim();
    if (k === 'ts') ts = value;
    if (k === 'v1') v1 = value;
  }

  if (!ts || !v1) {
    return { ok: false as const, status: 400 as const, erro: 'x-signature inválida' };
  }

  const tolerance = params.tsToleranceSeconds ?? 300;
  const tsNum = Number(ts);
  if (Number.isFinite(tsNum)) {
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - tsNum) > tolerance) {
      return { ok: false as const, status: 401 as const, erro: 'Webhook fora da janela de tolerância' };
    }
  }

  const dataIdNormalized = /^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId;
  const manifest = `id:${dataIdNormalized};request-id:${xRequestId};ts:${ts};`;
  const expected = crypto
    .createHmac('sha256', ENV.MERCADOPAGO_WEBHOOK_SECRET)
    .update(manifest)
    .digest('hex');

  if (expected !== v1) {
    return { ok: false as const, status: 401 as const, erro: 'Assinatura do webhook Mercado Pago inválida' };
  }

  return { ok: true as const, skipped: false as const };
}

export function mapMpPaymentToStatus(paymentStatus?: string) {
  const status = String(paymentStatus || '').toLowerCase();
  if (status === 'approved') return { pagamentoStatus: 'PAGO' as const };
  if (status === 'rejected' || status === 'cancelled' || status === 'charged_back') return { pagamentoStatus: 'FALHOU' as const };
  return { pagamentoStatus: 'AGUARDANDO' as const };
}

export function mapMpPaymentTypeToMetodo(paymentTypeId?: string) {
  const t = String(paymentTypeId || '').toLowerCase();
  if (t === 'pix') return 'PIX' as const;
  if (t === 'credit_card' || t === 'debit_card' || t === 'prepaid_card') return 'CARTAO' as const;
  return undefined;
}
