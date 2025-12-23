import mongoose, { Schema } from 'mongoose';

export type ChatMessageDoc = {
  appointmentId: string;
  senderId: string;
  recipientId: string;
  message: string;
  createdAt: Date;
  expiresAt: Date;
};

const chatMessageSchema = new Schema<ChatMessageDoc>(
  {
    appointmentId: {
      type: String,
      required: true,
      index: true,
    },
    senderId: {
      type: String,
      required: true,
      index: true,
    },
    recipientId: {
      type: String,
      required: true,
      index: true,
    },
    message: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  },
  {
    versionKey: false,
  }
);

// TTL Index: MongoDB automaticamente deleta documentos após expiresAt
chatMessageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const ChatMessage: mongoose.Model<ChatMessageDoc> = mongoose.models.ChatMessage
  ? (mongoose.models.ChatMessage as mongoose.Model<ChatMessageDoc>)
  : mongoose.model<ChatMessageDoc>('ChatMessage', chatMessageSchema);
