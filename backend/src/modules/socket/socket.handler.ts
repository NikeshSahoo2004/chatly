import { Server, Socket } from 'socket.io';
import { UserRepository } from '../user/user.repository';
import { logger } from '../../utils/logger';

const userRepo = new UserRepository();

export const registerSocketHandlers = (io: Server, socket: Socket): void => {
  const user = socket.data.user;
  if (!user) {
    return;
  }

  const userId = user.userId;
  const userRoom = `user:${userId}`;

  socket.join(userRoom);
  logger.info(`[Socket] User ${user.username} (ID: ${userId}) connected on socket: ${socket.id}`);

  const handlePresenceOnConnect = async () => {
    try {
      const activeSockets = await io.in(userRoom).allSockets();
      if (activeSockets.size === 1) {
        await userRepo.updateOnlineStatus(userId, true);
        socket.broadcast.emit('user:online', { userId });
        logger.info(`[Presence] User ${user.username} is now online`);
      }
    } catch (err) {
      logger.error('[Presence] Error updating online status on connect:', err);
    }
  };
  handlePresenceOnConnect();

  // JOIN conversation room (channel)
  socket.on('conversation:join', (data: { conversationId: string }, callback?: (res: any) => void) => {
    const { conversationId } = data;
    if (conversationId) {
      socket.join(`conversation:${conversationId}`);
      logger.debug(`[Socket] User ${user.username} (socket: ${socket.id}) joined room conversation:${conversationId}`);
      if (callback) {
        callback({ status: 'success' });
      }
    }
  });

  // LEAVE conversation room (channel)
  socket.on('conversation:leave', (data: { conversationId: string }, callback?: (res: any) => void) => {
    const { conversationId } = data;
    if (conversationId) {
      socket.leave(`conversation:${conversationId}`);
      logger.debug(`[Socket] User ${user.username} (socket: ${socket.id}) left room conversation:${conversationId}`);
      if (callback) {
        callback({ status: 'success' });
      }
    }
  });

  // TYPING indicators start
  socket.on('typing:start', (data: { conversationId: string }) => {
    const { conversationId } = data;
    if (conversationId) {
      socket.to(`conversation:${conversationId}`).emit('typing:start', {
        conversationId,
        userId,
        username: user.username,
      });
    }
  });

  // TYPING indicators stop
  socket.on('typing:stop', (data: { conversationId: string }) => {
    const { conversationId } = data;
    if (conversationId) {
      socket.to(`conversation:${conversationId}`).emit('typing:stop', {
        conversationId,
        userId,
      });
    }
  });

  // MESSAGE receipt: Delivered
  socket.on('message:delivered', (data: { messageId: string; conversationId: string; senderId: string }) => {
    const { messageId, conversationId, senderId } = data;
    if (messageId && conversationId && senderId) {
      // Direct receipt alert to the original sender's active devices
      socket.to(`user:${senderId}`).emit('message:delivered', {
        messageId,
        conversationId,
        userId,
      });
    }
  });

  // MESSAGE receipt: Seen
  socket.on('message:seen', (data: { messageId: string; conversationId: string; senderId: string }) => {
    const { messageId, conversationId, senderId } = data;
    if (messageId && conversationId && senderId) {
      // Direct receipt alert to the original sender's active devices
      socket.to(`user:${senderId}`).emit('message:seen', {
        messageId,
        conversationId,
        userId,
      });
    }
  });

  // Handle socket disconnection lifecycle
  socket.on('disconnect', async () => {
    logger.info(`[Socket] Socket disconnected: ${socket.id}`);
    try {
      const activeSockets = await io.in(userRoom).allSockets();
      // If no active connections remain for this user across any tab/device, mark them offline in DB
      if (activeSockets.size === 0) {
        const lastSeen = new Date();
        await userRepo.updateOnlineStatus(userId, false);
        // Broadcast presence offline update to everyone
        io.emit('user:offline', { userId, lastSeen });
        logger.info(`[Presence] User ${user.username} is now offline`);
      }
    } catch (err) {
      logger.error('[Presence] Error updating online status on disconnect:', err);
    }
  });
};
