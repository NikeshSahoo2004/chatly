import mongoose from 'mongoose';
import { config } from '../config';
import { logger } from '../utils/logger';
import { User } from '../modules/user/user.model';

export const seedAIBot = async (): Promise<void> => {
  try {
    const aiBot = await User.findOne({ username: 'chatly_ai' });
    if (!aiBot) {
      await User.create({
        name: 'Chatly AI',
        username: 'chatly_ai',
        email: 'ai@chatly.app',
        password: 'chatly_ai_bot_secure_password_12345!',
        avatar: 'ai_bot',
        isOnline: true,
      });
      logger.info('[Database] AI Bot user seeded successfully');
    } else if (!aiBot.isOnline) {
      aiBot.isOnline = true;
      await aiBot.save();
    }
  } catch (error) {
    logger.error('[Database] Failed to seed AI Bot user:', error);
  }
};

export const connectDB = async (): Promise<void> => {
  try {
    const conn = await mongoose.connect(config.mongo.uri);
    logger.info(`[Database] MongoDB Connected: ${conn.connection.host}/${conn.connection.name}`);
    await seedAIBot();
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
