import { Router, Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { authMiddleware, requireRole } from '../middlewares/auth.middleware.js';
import { validate } from '../middlewares/validate.middleware.js';
import { criarPagamentoCartaoSchema, criarPagamentoPixSchema } from '../validators/schemas.js';
import Stripe from 'stripe';
import { ENV } from '../env.js';
import emailService from '../services/email.service.js';
import { enviarPushParaUsuario } from '../services/push.service.js';

const r = Router();

// Inicializar Stripe (se configurado)
const stripe = ENV.STRIPE_SECRET_KEY ? new Stripe(ENV.STRIPE_SECRET_KEY) : null;

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
      case 'payment_intent.succeeded':
        const paymentIntent = event.data.object as Stripe.PaymentIntent;
        await prisma.pagamento.updateMany({
          where: { transacaoId: paymentIntent.id },
          data: { status: 'PAGO' },
        });

        // Atualizar status da consulta
        const pagamento = await prisma.pagamento.findFirst({
          where: { transacaoId: paymentIntent.id },
        });
        if (pagamento) {
          const consulta = await prisma.consulta.update({
            where: { id: pagamento.consultaId },
            data: { status: 'ACEITA' },
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
              pagamento.valorCentavos / 100,
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
            console.warn('Falha ao enviar notificações de pagamento (Stripe):', e);
          }
        }
        break;

      case 'payment_intent.payment_failed':
        const failedIntent = event.data.object as Stripe.PaymentIntent;
        await prisma.pagamento.updateMany({
          where: { transacaoId: failedIntent.id },
          data: { status: 'FALHOU' },
        });
        break;
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

    const atualizado = await prisma.pagamento.update({
      where: { id: pagamentoId },
      data: {
        status: 'PAGO',
        transacaoId: `PIX_${Date.now()}`,
      },
    });

    // Atualizar status da consulta
    const consulta = await prisma.consulta.update({
      where: { id: pagamento.consultaId },
      data: { status: 'ACEITA' },
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