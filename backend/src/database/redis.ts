import { createClient } from 'redis';
import { config } from '../config';
import { logger } from '../utils/logger';

export const redisClient = createClient({
  url: config.redis.url,
});

redisClient.on('connect', () => {
  logger.info('[Redis] Connecting to server...');
});

redisClient.on('ready', () => {
  logger.info('[Redis] Connection established and ready');
});

redisClient.on('error', (err) => {
  logger.error('[Redis] Client error:', err);
});

redisClient.on('end', () => {
  logger.warn('[Redis] Connection closed');
});

export const connectRedis = async (): Promise<void> => {
  try {
    await redisClient.connect();
  } catch (error) {
    logger.error('[Redis] Connection failed (verify Redis is running):', error);
  }
};

export const disconnectRedis = async (): Promise<void> => {
  try {
    if (redisClient.isOpen) {
      await redisClient.quit();
      logger.info('[Redis] Connection quit cleanly');
    }
  } catch (error) {
    logger.error('[Redis] Disconnection error:', error);
  }
};
