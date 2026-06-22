import jwt, { JwtPayload } from 'jsonwebtoken';
import { config } from '../config';
import { redisClient } from '../database/redis';
import { logger } from '../utils/logger';

export interface TokenPayload extends JwtPayload {
  userId: string;
  username: string;
  email: string;
  role: 'user' | 'admin';
}

export interface RefreshTokenPayload extends JwtPayload {
  userId: string;
}

export class TokenService {
  /**
   * Generate JWT Access Token
   */
  public generateAccessToken(
    payload: Omit<TokenPayload, 'iat' | 'exp'>
  ): string {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.expiration as any,
    });
  }

  /**
   * Generate JWT Refresh Token
   */
  public generateRefreshToken(payload: { userId: string }): string {
    return jwt.sign(payload, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiration as any,
    });
  }

  /**
   * Verify Access Token
   */
  public verifyAccessToken(token: string): TokenPayload {
    return jwt.verify(token, config.jwt.secret) as TokenPayload;
  }

  /**
   * Verify Refresh Token
   */
  public verifyRefreshToken(token: string): RefreshTokenPayload {
    return jwt.verify(token, config.jwt.refreshSecret) as RefreshTokenPayload;
  }

  /**
   * Blacklist a token (e.g. on logout or token reuse detection)
   */
  public async blacklistToken(
    token: string,
    type: 'access' | 'refresh'
  ): Promise<void> {
    try {
      const secret =
        type === 'access' ? config.jwt.secret : config.jwt.refreshSecret;
      const decoded = jwt.decode(token) as JwtPayload;

      if (!decoded || !decoded.exp) {
        return;
      }

      const expiry = decoded.exp;
      const now = Math.floor(Date.now() / 1000);
      const secondsRemaining = expiry - now;

      if (secondsRemaining > 0) {
        const key = `blacklist:${type}:${token}`;
        // Store in Redis if client is open, otherwise log warning
        if (redisClient.isOpen) {
          await redisClient.setEx(key, secondsRemaining, '1');
          logger.info(
            `[TokenService] Blacklisted ${type} token. Remaining TTL: ${secondsRemaining}s`
          );
        } else {
          logger.warn(
            `[TokenService] Redis connection not open. Failed to blacklist token: ${token.substring(0, 15)}...`
          );
        }
      }
    } catch (error) {
      logger.error('[TokenService] Error blacklisting token:', error);
    }
  }

  /**
   * Check if a token is blacklisted
   */
  public async isTokenBlacklisted(
    token: string,
    type: 'access' | 'refresh'
  ): Promise<boolean> {
    try {
      if (!redisClient.isOpen) {
        // Fallback if Redis is down (to prevent locking out users but log a critical warning)
        logger.warn(
          '[TokenService] Redis is down. Skipping token blacklist check.'
        );
        return false;
      }
      const key = `blacklist:${type}:${token}`;
      const result = await redisClient.get(key);
      return result !== null;
    } catch (error) {
      logger.error('[TokenService] Error checking blacklist status:', error);
      return false;
    }
  }
}
