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
import Redis from 'ioredis';
import { json } from 'stream/consumers';
import os from 'os';
import mongoose from 'mongoose';
import { Queue } from 'twilio/lib/twiml/VoiceResponse';

const app = express();
const server = http.createServer(app);

//Redis Client
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// CORS Configuration Options
const corsOptions = {
  origin: (
    origin: string | undefined,
    callback: (err: Error | null, allow?: boolean) => void
  ) => {
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
      logger.warn(
        `[CORS] Request from origin ${origin} blocked. Allowed origins: ${allowedOrigins.join(', ')}`
      );
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

// Redis test routes
app.get('/redis', async (req, res) => {
  const reply = await redis.ping();
  res.json({ redis: reply });
});

const BANNER_KEY = 'app:banner';

// App Banner Routes
app.post('/banner', async (req, res) => {
  await redis.set(
    BANNER_KEY,
    req.body.message || 'Welcome to redis implementation...'
  );
  res.json({
    success: true,
  });
});

app.get('/banner', async (req, res) => {
  const banner = await redis.get(BANNER_KEY);
  res.json({
    success: true,
    message: banner,
  });
});

app.delete('/banner', async (req, res) => {
  await redis.del(BANNER_KEY);
  res.json({
    success: true,
    message: 'Banner deleted successfully',
  });
});

app.get('/banner/exists', async (req, res) => {
  const exists = await redis.exists(BANNER_KEY);
  res.json({
    // exists: Boolean(exists)
    exists: JSON.stringify(exists),
  });
});

// User Json Routes

app.post('/user/:id/json', async (req, res) => {
  await redis.set(`user:${req.params.id}:json`, JSON.stringify(req.body));
  res.json({
    savedAs: 'json',
  });
});

app.get('/user/:id/json', async (req, res) => {
  const data = await redis.get(`user:${req.params.id}:json`);
  res.json({ user: data ? JSON.parse(data) : null });
});

app.post('/user/:id/hash', async (req, res) => {
  await redis.hset(`user:${req.params.id}:hash`, req.body);
  res.json({
    savedAs: 'hash',
  });
});

app.get('/user/:id/hash', async (req, res) => {
  const data = await redis.hgetall(`user:${req.params.id}:hash`);
  res.json({
    user: data || null,
  });
});

//Queue Routes
const QUEUE_KEY = 'queue:emails';

app.post('/emails', async (req, res) => {
  const job = {
    to: req.body.to || 'No To',
    subject: req.body.subject || 'No Subject',
    body: req.body.body || 'No Body',
  };
  await redis.lpush(QUEUE_KEY, JSON.stringify(job));
  return res.json({ queued: true, job });
});

app.get('/emails', async (req, res) => {
  const rawJob = await redis.rpop(QUEUE_KEY);
  if (!rawJob) {
    return res.json({});
  }

  const job = JSON.parse(rawJob);
  res.json({ processed: true, job });

  //simulate Email sending
  res.json({ message: 'Email sent', job });
});

// Health Check API

app.get('/health', async (req, res) => {
  const startTime = Date.now();

  try {
    // Redis Check
    let redisStatus = 'Disconnected❌';

    try {
      const redisResponse = await redis.ping();
      redisStatus = redisResponse === 'PONG' ? 'Connected✅' : 'Disconnected❌';
    } catch (error) {
      redisStatus = 'Disconnected❌';
    }

    // MongoDB Check
    const mongoStates = {
      0: 'Disconnected',
      1: 'Connected',
      2: 'Connecting',
      3: 'Disconnecting',
    };

    const mongoStatus =
      mongoStates[mongoose.connection.readyState] || 'Unknown';

    const memoryUsage = process.memoryUsage();

    const response = {
      success: true,
      status: 'Healthy✅',

      services: {
        api: 'Running✅',
        mongodb: mongoStatus,
        redis: redisStatus,
      },

      system: {
        platform: process.platform,
        architecture: process.arch,
        hostname: os.hostname(),
        nodeVersion: process.version,
        environment: process.env.NODE_ENV,
        uptime: `${Math.floor(process.uptime())} seconds`,
      },

      memory: {
        rss: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`,
        heapTotal: `${(memoryUsage.heapTotal / 1024 / 1024).toFixed(2)} MB`,
        heapUsed: `${(memoryUsage.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        external: `${(memoryUsage.external / 1024 / 1024).toFixed(2)} MB`,
      },

      cpu: {
        loadAverage: os.loadavg(),
        cpuCount: os.cpus().length,
      },

      timestamp: new Date().toISOString(),
      responseTime: `${Date.now() - startTime} ms`,
    };

    const isHealthy =
      mongoStatus === 'Connected✅' && redisStatus === 'Connected✅';

    return res.status(isHealthy ? 200 : 503).json(response);
  } catch (error) {
    return res.status(503).json({
      success: false,
      status: 'Unhealthy',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// WebSocket Configuration
const io = new Server(server, {
  cors: corsOptions,
});

// Configure Redis scaling adapter if connected
if (redisClient.isOpen && subClient.isOpen) {
  io.adapter(createAdapter(redisClient, subClient));
  logger.info('[Socket.IO] Redis scaling adapter registered successfully');
} else {
  logger.warn(
    '[Socket.IO] Redis clients not open. Falling back to in-memory adapter.'
  );
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
eventEmitter.on(
  'message:delete',
  (data: { messageId: string; conversationId: string }) => {
    io.to(`conversation:${data.conversationId}`).emit('message:delete', data);
  }
);

// Broadcast group creation to all group participants
eventEmitter.on('group:created', (group) => {
  try {
    group.participants.forEach((participant: any) => {
      const participantId = participant._id
        ? participant._id.toString()
        : participant.toString();
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
      const participantId = participant._id
        ? participant._id.toString()
        : participant.toString();
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
      logger.info(
        `[Server] Running in ${config.env} mode on port http://localhost:${PORT}`
      );
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
