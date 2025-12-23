import admin from 'firebase-admin';
import { ENV } from '../env.js';
import { prisma } from '../utils/prisma.js';

let initialized = false;

function initFirebase() {
  if (initialized) return;

  try {
    if (ENV.FIREBASE_SERVICE_ACCOUNT_JSON) {
      const serviceAccount = JSON.parse(ENV.FIREBASE_SERVICE_ACCOUNT_JSON);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      initialized = true;
      return;
    }

    // Fallback: usa credenciais padrão do ambiente (ex: GOOGLE_APPLICATION_CREDENTIALS)
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    initialized = true;
  } catch (e) {
    // Não quebra a API se push não estiver configurado
    if (ENV.NODE_ENV === 'development') {
      console.warn('FCM não inicializado (push desabilitado):', e);
    } else {
      const msg = typeof (e as any)?.message === 'string' ? (e as any).message : 'Erro ao inicializar FCM';
      console.warn('FCM não inicializado (push desabilitado):', msg);
    }
    initialized = false;
  }
}

async function listUserTokens(usuarioId: string): Promise<string[]> {
  const tokens = await prisma.deviceToken.findMany({
    where: { usuarioId },
    select: { token: true },
  });
  return tokens.map((t) => t.token);
}

export async function enviarPushParaUsuario(options: {
  usuarioId: string;
  titulo: string;
  corpo: string;
  data?: Record<string, string>;
}) {
  initFirebase();
  if (!initialized) return { ok: false, enviado: 0 };

  const tokens = await listUserTokens(options.usuarioId);
  if (tokens.length === 0) return { ok: true, enviado: 0 };

  const res = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: options.titulo,
      body: options.corpo,
    },
    data: options.data,
  });

  // Remove tokens inválidos
  const invalidTokens: string[] = [];
  res.responses.forEach((r, idx) => {
    if (!r.success) {
      const code = (r.error as any)?.code as string | undefined;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
        invalidTokens.push(tokens[idx]);
      }
    }
  });

  if (invalidTokens.length > 0) {
    await prisma.deviceToken.deleteMany({
      where: { token: { in: invalidTokens } },
    });
  }

  return {
    ok: true,
    enviado: res.successCount,
    falhas: res.failureCount,
  };
}
