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
import apiRoutes from './route';
import { requestLogger } from './middleware/request-logger.middleware';
import { createAdapter } from '@socket.io/redis-adapter';
import { socketAuth } from './modules/socket/socket.middleware';
import { registerSocketHandlers } from './modules/socket/socket.handler';
import { eventEmitter } from './events/emitter';
import { Conversation } from './modules/chat/conversation.model';
import { initAIService } from './services/ai.service';

const app = express();
const server = http.createServer(app);

// CORS Configuration Options
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // Allow requests with no origin (like mobile apps, curl, postman)
    if (!origin) {
      return callback(null, true);
    }
    
    const allowedOrigins = config.cors.origin;
    const cleanOrigin = origin.trim().replace(/\/$/, '');
    
    const isAllowed = allowedOrigins.some((allowed) => {
      const cleanAllowed = allowed.trim().replace(/\/$/, '');
      return cleanAllowed === '*' || cleanAllowed === cleanOrigin;
    });

    if (isAllowed) {
      callback(null, true);
    } else {
      logger.warn(`[CORS] Request from origin ${origin} blocked. Allowed origins: ${allowedOrigins.join(', ')}`);
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
};

// Global Middlewares
app.use(requestLogger);
app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());

// Health Check API
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'Healthy', timestamp: new Date() });
});

// WebSocket Configuration
const io = new Server(server, {
  cors: corsOptions
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

// Initialize AI Service
initAIService(io);

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
app.use('/api', apiRoutes);

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
