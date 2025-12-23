import { ChatMessage } from '../models/mongodb/chatMessage.model.js';

const TTL_DAYS = 30;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

export class ChatService {
  async saveMessage(params: {
    appointmentId: string;
    senderId: string;
    recipientId: string;
    message: string;
  }) {
    const newMessage = new ChatMessage({
      appointmentId: params.appointmentId,
      senderId: params.senderId,
      recipientId: params.recipientId,
      message: params.message,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + TTL_MS),
    });

    return await newMessage.save();
  }

  async getAppointmentChat(appointmentId: string, limit = 50) {
    return await ChatMessage.find({ appointmentId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }

  async deleteChatHistory(appointmentId: string) {
    return await ChatMessage.deleteMany({ appointmentId });
  }
}

export const chatService = new ChatService();
