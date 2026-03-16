import { ENV } from '../env.js';
import { logger, serializeError } from '../logger/winston.js';

/**
 * Envia mensagem WhatsApp via Twilio Sandbox / API.
 * Requer: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM
 */
export async function enviarWhatsApp(params: {
  para: string; // formato E.164: +5511999998888
  mensagem: string;
}): Promise<boolean> {
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM } = ENV;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_WHATSAPP_FROM) {
    logger.debug('whatsapp_skip', { reason: 'Twilio não configurado' });
    return false;
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(TWILIO_ACCOUNT_SID)}/Messages.json`;

  const body = new URLSearchParams({
    From: `whatsapp:${TWILIO_WHATSAPP_FROM}`,
    To: `whatsapp:${params.para}`,
    Body: params.mensagem,
  });

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      logger.warn('whatsapp_send_failed', { status: resp.status, body: text.slice(0, 500) });
      return false;
    }

    logger.info('whatsapp_sent', { para: params.para.slice(0, 6) + '***' });
    return true;
  } catch (e) {
    logger.warn('whatsapp_error', { error: serializeError(e as Error) });
    return false;
  }
}
