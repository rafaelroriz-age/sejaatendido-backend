import { prisma } from '../utils/prisma.js';
import { logger } from '../logger/winston.js';

/**
 * Acumula saldo pendente do médico quando um repasse (por consulta) é criado.
 * Chamado em criarRepasse() após inserir o Repasse individual.
 */
export async function acumularSaldoPendente(medicoId: string, valorRepasseCentavos: number) {
  await prisma.medico.update({
    where: { id: medicoId },
    data: { saldoPendente: { increment: valorRepasseCentavos } },
  });
  logger.info('saldo_pendente_acumulado', { medicoId, valorRepasseCentavos });
}

/**
 * Domingo 23:59 — move saldoPendente → saldoALiberar para todos os médicos.
 * Cria um CicloRepasse PENDENTE para cada médico com saldo > 0.
 * Calcula próximo repasse = segunda-feira seguinte 08:00.
 */
export async function moverSaldoParaLiberar(): Promise<{ medicosProcessados: number }> {
  const medicos = await prisma.medico.findMany({
    where: { saldoPendente: { gt: 0 } },
  });

  if (medicos.length === 0) {
    logger.info('mover_saldo_nenhum_medico');
    return { medicosProcessados: 0 };
  }

  const now = new Date();

  // Semana: domingo atual recuando 7 dias como início, agora como fim
  const semanaFim = new Date(now);
  semanaFim.setHours(23, 59, 59, 999);
  const semanaInicio = new Date(semanaFim);
  semanaInicio.setDate(semanaInicio.getDate() - 6);
  semanaInicio.setHours(0, 0, 0, 0);

  // Próximo repasse = amanhã (segunda) às 08:00
  const proximoRepasse = new Date(now);
  proximoRepasse.setDate(proximoRepasse.getDate() + 1);
  proximoRepasse.setHours(8, 0, 0, 0);

  let processados = 0;

  for (const medico of medicos) {
    try {
      const saldoAMover = medico.saldoPendente;

      // Busca repasses PENDENTES sem ciclo vinculado para este médico
      const repassesPendentes = await prisma.repasse.findMany({
        where: {
          medicoId: medico.id,
          status: 'PENDENTE',
          cicloRepasseId: null,
        },
      });

      const valorBrutoTotal = repassesPendentes.reduce((s, r) => s + r.valorBruto, 0);
      const taxaAppTotal = repassesPendentes.reduce((s, r) => s + r.taxaApp, 0);

      // Cria ciclo (upsert para idempotência)
      const ciclo = await prisma.cicloRepasse.upsert({
        where: {
          medicoId_semanaInicio: { medicoId: medico.id, semanaInicio },
        },
        create: {
          medicoId: medico.id,
          semanaInicio,
          semanaFim,
          valorBruto: valorBrutoTotal,
          taxaApp: taxaAppTotal,
          valorRepasse: saldoAMover,
          status: 'PENDENTE',
        },
        update: {
          valorBruto: { increment: valorBrutoTotal },
          taxaApp: { increment: taxaAppTotal },
          valorRepasse: { increment: saldoAMover },
        },
      });

      // Vincula repasses ao ciclo
      if (repassesPendentes.length > 0) {
        await prisma.repasse.updateMany({
          where: {
            id: { in: repassesPendentes.map((r) => r.id) },
          },
          data: { cicloRepasseId: ciclo.id },
        });
      }

      // Move saldo
      await prisma.medico.update({
        where: { id: medico.id },
        data: {
          saldoPendente: { decrement: saldoAMover },
          saldoALiberar: { increment: saldoAMover },
          proximoRepasse,
        },
      });

      processados++;
      logger.info('saldo_movido_para_liberar', {
        medicoId: medico.id,
        saldoMovido: saldoAMover,
        cicloId: ciclo.id,
      });
    } catch (e) {
      logger.error('saldo_mover_erro', {
        medicoId: medico.id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { medicosProcessados: processados };
}

/**
 * Segunda 08:00 — processa pagamentos Pix para todos os ciclos PENDENTES.
 * Para cada ciclo: chama MP Payout API, atualiza saldo, marca repasses como PROCESSADO.
 */
export async function processarRepassesSemanal(
  enviarPayout: (params: {
    medicoId: string;
    valorCentavos: number;
    cicloId: string;
  }) => Promise<{ ok: boolean; mpPaymentId?: string; erro?: string }>,
): Promise<{ ciclosProcessados: number; ciclosFalharam: number }> {
  const ciclos = await prisma.cicloRepasse.findMany({
    where: { status: 'PENDENTE' },
    include: {
      medico: {
        select: {
          id: true,
          tipoChavePix: true,
          valorChavePix: true,
          usuarioId: true,
        },
      },
    },
  });

  if (ciclos.length === 0) {
    logger.info('processar_repasses_nenhum_ciclo');
    return { ciclosProcessados: 0, ciclosFalharam: 0 };
  }

  let processados = 0;
  let falharam = 0;

  for (const ciclo of ciclos) {
    try {
      // Marca como PROCESSANDO
      await prisma.cicloRepasse.update({
        where: { id: ciclo.id },
        data: { status: 'PROCESSANDO' },
      });

      // Verifica se médico tem dados Pix
      if (!ciclo.medico.tipoChavePix || !ciclo.medico.valorChavePix) {
        await prisma.cicloRepasse.update({
          where: { id: ciclo.id },
          data: {
            status: 'ERRO',
            erroMsg: 'Médico sem chave Pix cadastrada',
            dataProcessamento: new Date(),
          },
        });
        falharam++;
        logger.warn('repasse_sem_pix', { medicoId: ciclo.medicoId, cicloId: ciclo.id });
        continue;
      }

      // Chama payout
      const result = await enviarPayout({
        medicoId: ciclo.medicoId,
        valorCentavos: ciclo.valorRepasse,
        cicloId: ciclo.id,
      });

      if (!result.ok) {
        await prisma.cicloRepasse.update({
          where: { id: ciclo.id },
          data: {
            status: 'ERRO',
            erroMsg: result.erro || 'Erro desconhecido no payout',
            dataProcessamento: new Date(),
          },
        });
        falharam++;
        logger.error('repasse_payout_falhou', { cicloId: ciclo.id, erro: result.erro });
        continue;
      }

      // Sucesso: atualiza ciclo, repasses vinculados e saldo do médico
      await prisma.$transaction([
        prisma.cicloRepasse.update({
          where: { id: ciclo.id },
          data: {
            status: 'CONCLUIDO',
            mpPaymentId: result.mpPaymentId || null,
            dataProcessamento: new Date(),
          },
        }),
        prisma.repasse.updateMany({
          where: { cicloRepasseId: ciclo.id },
          data: { status: 'PROCESSADO', dataRepasse: new Date() },
        }),
        prisma.medico.update({
          where: { id: ciclo.medicoId },
          data: {
            saldoALiberar: { decrement: ciclo.valorRepasse },
            saldoTotalRecebido: { increment: ciclo.valorRepasse },
            proximoRepasse: null,
          },
        }),
      ]);

      processados++;
      logger.info('repasse_ciclo_concluido', {
        cicloId: ciclo.id,
        medicoId: ciclo.medicoId,
        valor: ciclo.valorRepasse,
        mpPaymentId: result.mpPaymentId,
      });
    } catch (e) {
      falharam++;
      logger.error('repasse_ciclo_erro', {
        cicloId: ciclo.id,
        error: e instanceof Error ? e.message : String(e),
      });
      try {
        await prisma.cicloRepasse.update({
          where: { id: ciclo.id },
          data: {
            status: 'ERRO',
            erroMsg: e instanceof Error ? e.message : String(e),
            dataProcessamento: new Date(),
          },
        });
      } catch {
        // best-effort
      }
    }
  }

  return { ciclosProcessados: processados, ciclosFalharam: falharam };
}
