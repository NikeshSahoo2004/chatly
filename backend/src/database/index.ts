import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';

export const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(config.mongo.uri);
    logger.info(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    logger.error('[Database] MongoDB connection error:', error);
    process.exit(1);
  }
};

export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    logger.info('[Database] MongoDB connection closed');
  } catch (error) {
    logger.error('[Database] MongoDB disconnection error:', error);
  }
};

// Monitor connection state changes
mongoose.connection.on('disconnected', () => {
  logger.warn('[Database] MongoDB disconnected');
});

mongoose.connection.on('error', (err) => {
  logger.error('[Database] MongoDB connection listener error:', err);
});
