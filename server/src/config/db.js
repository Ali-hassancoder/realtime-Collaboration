import mongoose from 'mongoose';
import { logger } from '../utils/logger.js';

export async function connectDB(uri) {
  if (!uri) {
    throw new Error('MONGO_URI is not defined. Set it in server/.env');
  }

  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected'));

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  logger.info({ host: mongoose.connection.host }, 'MongoDB connected');
}

export async function disconnectDB() {
  await mongoose.connection.close();
}