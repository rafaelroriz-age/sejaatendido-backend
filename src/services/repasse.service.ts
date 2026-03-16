import { prisma } from '../utils/prisma.js';
import { ENV } from '../env.js';
import { logger } from '../logger/winston.js';

/**
 * Cria um repasse após pagamento confirmado.
 * valorBruto = valor total pago (centavos)
 * taxaApp = percentual retido pelo app (ENV.TAXA_APP_PERCENTUAL, default 10%)
 * valorRepasse = valorBruto - taxaApp
 */
export async function criarRepasse(params: {
  consultaId: string;
  medicoId: string;
  valorBrutoCentavos: number;
}): Promise<{ ok: boolean; repasseId?: string }> {
  // Verifica se já existe repasse para esta consulta (idempotência)
  const existente = await prisma.repasse.findUnique({ where: { consultaId: params.consultaId } });
  if (existente) {
    logger.info('repasse_already_exists', { consultaId: params.consultaId, repasseId: existente.id });
    return { ok: true, repasseId: existente.id };
  }

  const taxa = ENV.TAXA_APP_PERCENTUAL;
  const taxaApp = Math.round(params.valorBrutoCentavos * (taxa / 100));
  const valorRepasse = params.valorBrutoCentavos - taxaApp;

  const repasse = await prisma.repasse.create({
    data: {
      consultaId: params.consultaId,
      medicoId: params.medicoId,
      valorBruto: params.valorBrutoCentavos,
      taxaApp,
      valorRepasse,
      status: 'PENDENTE',
    },
  });

  logger.info('repasse_created', {
    repasseId: repasse.id,
    consultaId: params.consultaId,
    valorBruto: params.valorBrutoCentavos,
    taxaApp,
    valorRepasse,
    taxaPercentual: taxa,
  });

  return { ok: true, repasseId: repasse.id };
}
