/**
 * WhatsApp service via API oficial do WhatsApp Business (Meta Cloud API).
 *
 * Requer:
 *  - WHATSAPP_TOKEN (token de acesso permanente)
 *  - WHATSAPP_PHONE_NUMBER_ID (ID do número no painel)
 *  - WHATSAPP_API_VERSION (ex: v19.0)
 */
import { ENV } from '../env.js';
import { logger, serializeError } from '../logger/winston.js';

/** Formata telefone brasileiro para o formato E.164 sem o "+" (ex: 5562999998888) */
function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('55') ? digits : `55${digits}`;
}

/**
 * Envia mensagem WhatsApp usando template aprovado pela Meta.
 *
 * @param para - Telefone destino (qualquer formato brasileiro)
 * @param templateName - Nome do template aprovado no Meta Business Manager
 * @param components - Componentes do template (body parameters, etc.)
 * @param languageCode - Código do idioma do template (default: pt_BR)
 */
export async function enviarWhatsAppTemplate(params: {
  para: string;
  templateName: string;
  components?: any[];
  languageCode?: string;
}): Promise<boolean> {
  const { WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION } = ENV;

  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_NUMBER_ID) {
    logger.debug('whatsapp_skip', { reason: 'WhatsApp Business API não configurada' });
    return false;
  }

  const phone = formatPhone(params.para);
  const version = WHATSAPP_API_VERSION || 'v19.0';
  const url = `https://graph.facebook.com/${encodeURIComponent(version)}/${encodeURIComponent(WHATSAPP_PHONE_NUMBER_ID)}/messages`;

  const body = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: params.templateName,
      language: { code: params.languageCode || 'pt_BR' },
      ...(params.components?.length ? { components: params.components } : {}),
    },
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const data = await resp.json().catch(() => ({})) as any;
      const errorCode = data?.error?.code;
      const errorMsg = data?.error?.message || '';

      // Tratamento de erros comuns da Meta API
      if (errorCode === 131030) {
        logger.warn('whatsapp_template_not_found', { template: params.templateName, error: errorMsg });
      } else if (errorCode === 131047) {
        logger.warn('whatsapp_invalid_number', { phone: phone.slice(0, 6) + '***', error: errorMsg });
      } else {
        logger.warn('whatsapp_send_failed', {
          status: resp.status,
          errorCode,
          error: errorMsg.slice(0, 500),
          template: params.templateName,
        });
      }
      return false;
    }

    logger.info('whatsapp_sent', { para: phone.slice(0, 6) + '***', template: params.templateName });
    return true;
  } catch (e) {
    logger.warn('whatsapp_error', { error: serializeError(e as Error) });
    return false;
  }
}

/**
 * Compatibilidade: envia mensagem WhatsApp via template.
 * Usado pelo notification.service.ts (notificarWhatsApp).
 *
 * Para mensagens proativas (notificações), a Meta exige templates aprovados.
 * Esta função usa o template "mensagem_generica" como fallback.
 * Prefira usar enviarWhatsAppTemplate diretamente com o template correto.
 */
export async function enviarWhatsApp(params: {
  para: string;
  mensagem: string;
}): Promise<boolean> {
  // Fallback: usa template genérico com um parâmetro de texto
  return enviarWhatsAppTemplate({
    para: params.para,
    templateName: 'mensagem_generica',
    components: [
      {
        type: 'body',
        parameters: [{ type: 'text', text: params.mensagem }],
      },
    ],
  });
}
