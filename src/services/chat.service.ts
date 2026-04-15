import { prisma } from '../utils/prisma.js';

const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

export const chatService = {
  async saveMessage(params: {
    consultaId: string;
    remetenteId: string;
    destinatarioId: string;
    mensagem: string;
  }) {
    return prisma.chatMensagem.create({
      data: {
        consultaId: params.consultaId,
        remetenteId: params.remetenteId,
        destinatarioId: params.destinatarioId,
        mensagem: params.mensagem,
        expiraEm: new Date(Date.now() + TTL_MS),
      },
    });
  },

  async getMessages(consultaId: string, limit = 50, cursor?: string) {
    return prisma.chatMensagem.findMany({
      where: { consultaId, expiraEm: { gt: new Date() } },
      orderBy: { criadoEm: 'desc' },
      take: limit,
      ...(cursor
        ? { skip: 1, cursor: { id: cursor } }
        : {}),
      select: {
        id: true,
        consultaId: true,
        remetenteId: true,
        destinatarioId: true,
        mensagem: true,
        lidaEm: true,
        criadoEm: true,
      },
    });
  },

  async markAsRead(consultaId: string, userId: string) {
    const { count } = await prisma.chatMensagem.updateMany({
      where: { consultaId, destinatarioId: userId, lidaEm: null },
      data: { lidaEm: new Date() },
    });
    return count;
  },

  async deleteExpired() {
    const { count } = await prisma.chatMensagem.deleteMany({
      where: { expiraEm: { lt: new Date() } },
    });
    return count;
  },
};
