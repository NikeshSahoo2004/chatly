import dotenv from 'dotenv';
import path from 'path';

// Load env vars
dotenv.config({ path: path.join(__dirname, '../../.env') });

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '5000', 10),
  mongo: {
    uri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chatly',
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback_jwt_secret',
    expiration: process.env.JWT_EXPIRATION || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'fallback_refresh_secret',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY || '637861746c79656e63727970746b6579646576656c6f706d656e746b65793132', // Must be 32 bytes hex
  },
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 mins
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  }
};
