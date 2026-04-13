import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  type WASocket,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { logger, serializeError } from '../logger/winston.js';
import { ENV } from '../env.js';

let sock: WASocket | null = null;
let connected = false;

/**
 * Conecta ao WhatsApp via Baileys (multi-device).
 * Mantém estado de autenticação em `auth_info/`.
 * Se não houver sessão, exibe QR Code no terminal.
 */
export async function connectWhatsApp(): Promise<void> {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info');

    sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        qrcode.generate(qr, { small: true });
        logger.info('whatsapp_qr', { msg: 'Escaneie o QR code acima com o WhatsApp' });
      }

      if (connection === 'close') {
        connected = false;
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        logger.warn('whatsapp_disconnected', { statusCode, shouldReconnect });
        if (shouldReconnect) {
          connectWhatsApp();
        }
      }

      if (connection === 'open') {
        connected = true;
        logger.info('whatsapp_connected');
      }
    });
  } catch (e) {
    logger.error('whatsapp_connect_error', { error: serializeError(e as Error) });
  }
}

/** Retorna true se o socket Baileys está conectado */
export function isWhatsAppConnected(): boolean {
  return connected && sock !== null;
}

/**
 * Formata telefone brasileiro para JID do WhatsApp.
 * Aceita formatos: +55..., 55..., 62999... — sempre normaliza para `55DDD9XXXX@s.whatsapp.net`.
 */
function formatJid(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const normalized = digits.startsWith('55') ? digits : `55${digits}`;
  return `${normalized}@s.whatsapp.net`;
}

/**
 * Envia mensagem WhatsApp via Baileys.
 * Requer: Baileys conectado (QR escaneado previamente).
 */
export async function enviarWhatsApp(params: {
  para: string; // telefone (ex: +5562999998888, 5562999998888, 62999998888)
  mensagem: string;
}): Promise<boolean> {
  if (!sock || !connected) {
    logger.debug('whatsapp_skip', { reason: 'Baileys não conectado' });
    return false;
  }

  const jid = formatJid(params.para);

  try {
    await sock.sendMessage(jid, { text: params.mensagem });
    logger.info('whatsapp_sent', { para: jid.slice(0, 8) + '***' });
    return true;
  } catch (e) {
    logger.warn('whatsapp_error', { error: serializeError(e as Error) });
    return false;
  }
}
