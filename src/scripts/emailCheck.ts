import { ENV } from '../env.js';
import { enviarEmail, verificarSMTP } from '../services/email.service.js';

function getArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  const val = process.argv[idx + 1];
  if (!val || val.startsWith('--')) return undefined;
  return val;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function printHelp() {
  // Não imprime credenciais/env completos por segurança.
  console.log(`
Uso:
  npm run email:check
  npm run email:check -- --to voce@dominio.com

O que faz:
  - Verifica conectividade SMTP via transporter.verify()
  - Se --to for informado, envia um email de teste

Variáveis de ambiente usadas:
  - SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM
  - NODE_ENV, BACKEND_URL, FRONTEND_URL
`);
}

async function main() {
  if (hasFlag('--help') || hasFlag('-h')) {
    printHelp();
    process.exit(0);
  }

  const to = getArg('--to');
  const subject = getArg('--subject') ?? 'Teste SMTP - SejaAtendido';

  const summary = {
    nodeEnv: ENV.NODE_ENV,
    smtpHost: ENV.SMTP_HOST,
    smtpPort: ENV.SMTP_PORT,
    smtpUserConfigured: !!ENV.SMTP_USER,
    smtpPassConfigured: !!ENV.SMTP_PASS,
    emailFromConfigured: !!ENV.EMAIL_FROM,
  };

  console.log('SMTP config summary:', summary);

  const verify = await verificarSMTP();
  if (!verify.ok) {
    console.error('SMTP verify: FAIL:', (verify as { ok: false; erro: string }).erro);
    process.exit(2);
  }
  console.log('SMTP verify: OK');

  if (to) {
    const ok = await enviarEmail({
      to,
      subject,
      html: `<!doctype html>
<html>
  <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial">
    <h3>Teste SMTP</h3>
    <p>Se você recebeu este email, o SMTP está funcionando.</p>
    <p>Ambiente: <b>${ENV.NODE_ENV}</b></p>
    <p>Timestamp: ${new Date().toISOString()}</p>
  </body>
</html>`,
    });

    if (!ok) {
      console.error('Send test email: FAIL');
      process.exit(3);
    }

    console.log('Send test email: OK');
  }
}

main().catch((e) => {
  console.error('email:check failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
