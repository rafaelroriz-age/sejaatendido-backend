import mongoose from 'mongoose';
import { ENV } from '../env.js';

let connectPromise: Promise<typeof mongoose> | null = null;

export function isMongoConnected() {
  return mongoose.connection.readyState === 1;
}

export async function connectMongoDB(options?: { exitOnFail?: boolean }) {
  const mongoUri = ENV.MONGODB_URI;

  if (!mongoUri) {
    return null;
  }

  if (isMongoConnected()) {
    return mongoose;
  }

  if (!connectPromise) {
    connectPromise = mongoose.connect(mongoUri).then(() => mongoose);
  }

  try {
    await connectPromise;
    console.log('✅ MongoDB conectado');
    return mongoose;
  } catch (error) {
    console.error('❌ Erro ao conectar MongoDB:', error);
    connectPromise = null;

    if (options?.exitOnFail) {
      process.exit(1);
    }

    return null;
  }
}

export async function disconnectMongoDB() {
  if (!isMongoConnected()) {
    return;
  }
  await mongoose.disconnect();
}
