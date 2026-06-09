import { createClient } from 'redis';
import { config } from '../config';
import { logger } from '../utils/logger';

export const redisClient = createClient({
  url: config.redis.url,
});

// Duplicated client instance required for socket adapter subscriptions
export const subClient = redisClient.duplicate();

// Logger events for primary client
redisClient.on('connect', () => {
  logger.info('[Redis] Primary client connecting to server...');
});

redisClient.on('ready', () => {
  logger.info('[Redis] Primary connection established and ready');
});

redisClient.on('error', (err) => {
  logger.error('[Redis] Primary client error:', err);
});

redisClient.on('end', () => {
  logger.warn('[Redis] Primary connection closed');
});

// Logger events for subscription client
subClient.on('connect', () => {
  logger.info('[Redis] Sub client connecting to server...');
});

subClient.on('ready', () => {
  logger.info('[Redis] Sub connection established and ready');
});

subClient.on('error', (err) => {
  logger.error('[Redis] Sub client error:', err);
});

subClient.on('end', () => {
  logger.warn('[Redis] Sub connection closed');
});

export const connectRedis = async (): Promise<void> => {
  try {
    await Promise.all([
      redisClient.connect(),
      subClient.connect(),
    ]);
  } catch (error) {
    logger.error('[Redis] Connection failed (verify Redis is running):', error);
  }
};

export const disconnectRedis = async (): Promise<void> => {
  try {
    const quitPromises: Promise<any>[] = [];
    if (redisClient.isOpen) {
      quitPromises.push(redisClient.quit());
    }
    if (subClient.isOpen) {
      quitPromises.push(subClient.quit());
    }
    await Promise.all(quitPromises);
    logger.info('[Redis] Connections closed cleanly');
  } catch (error) {
    logger.error('[Redis] Disconnection error:', error);
  }
};
