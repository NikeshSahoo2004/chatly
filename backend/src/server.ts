import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error.middleware';
import { connectDB } from './database';
import { connectRedis, redisClient, subClient } from './database/redis';
import authRoutes from './modules/auth/auth.routes';
import chatRoutes from './modules/chat/chat.routes';
import { createAdapter } from '@socket.io/redis-adapter';
import { socketAuth } from './modules/socket/socket.middleware';
import { registerSocketHandlers } from './modules/socket/socket.handler';
import { eventEmitter } from './events/emitter';
import { Conversation } from './modules/chat/conversation.model';

const app = express();
const server = http.createServer(app);

// Global Middlewares
app.use(helmet());
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

// Health Check API
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date() });
});

// WebSocket Configuration
const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    methods: ['GET', 'POST'],
    credentials: true,
  }
});

// Configure Redis scaling adapter if connected
if (redisClient.isOpen && subClient.isOpen) {
  io.adapter(createAdapter(redisClient, subClient));
  logger.info('[Socket.IO] Redis scaling adapter registered successfully');
} else {
  logger.warn('[Socket.IO] Redis clients not open. Falling back to in-memory adapter.');
}

// Handshake verification middleware
io.use(socketAuth);

// Bind connection events
io.on('connection', (socket) => {
  registerSocketHandlers(io, socket);
});

// Broadcast messages emitted from the message service
eventEmitter.on('message:new', async (message) => {
  const conversationId = message.conversationId.toString();
  // Broadcast to the conversation room (active users in the chat UI)
  io.to(`conversation:${conversationId}`).emit('message:receive', message);

  try {
    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      // Broadcast update notification to all participants' user rooms (active devices)
      conversation.participants.forEach((participantId) => {
        io.to(`user:${participantId.toString()}`).emit('message:notification', {
          conversationId,
          message,
        });
      });
    }
  } catch (err) {
    logger.error('[Socket] Error notifying participants on new message:', err);
  }
});

// Broadcast message deletion events
eventEmitter.on('message:delete', (data: { messageId: string; conversationId: string }) => {
  io.to(`conversation:${data.conversationId}`).emit('message:delete', data);
});

// Broadcast group creation to all group participants
eventEmitter.on('group:created', (group) => {
  try {
    group.participants.forEach((participant: any) => {
      const participantId = participant._id ? participant._id.toString() : participant.toString();
      io.to(`user:${participantId}`).emit('group:created', group);
    });
  } catch (err) {
    logger.error('[Socket] Error broadcasting group:created event:', err);
  }
});

// Broadcast group updates to group room and notify user rooms
eventEmitter.on('group:updated', (group) => {
  try {
    const conversationId = group._id.toString();
    // Emit to conversation room (active group chat UI)
    io.to(`conversation:${conversationId}`).emit('group:updated', group);

    // Notify all participants' personal rooms
    group.participants.forEach((participant: any) => {
      const participantId = participant._id ? participant._id.toString() : participant.toString();
      io.to(`user:${participantId}`).emit('group:notification_update', group);
    });
  } catch (err) {
    logger.error('[Socket] Error broadcasting group:updated event:', err);
  }
});

// Register API Routes
app.use('/api/auth', authRoutes);
app.use('/api', chatRoutes);

// Global Error Handler (must be registered last)
app.use(errorHandler);

const PORT = config.port;

const startServer = async () => {
  try {
    await connectDB();
    await connectRedis();
    server.listen(PORT, () => {
      logger.info(`[Server] Running in ${config.env} mode on port ${PORT}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (config.env !== 'test') {
  startServer();
}
export { app, server, io };
