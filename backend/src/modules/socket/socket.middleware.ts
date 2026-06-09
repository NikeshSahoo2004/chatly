import { Socket } from 'socket.io';
import { TokenService } from '../../services/token.service';
import { logger } from '../../utils/logger';

const tokenService = new TokenService();

// Manual cookie parser helper since Express middlewares don't run in Socket.IO natively
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) {
    return list;
  }
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const name = parts.shift()?.trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

export const socketAuth = async (socket: Socket, next: (err?: any) => void): Promise<void> => {
  try {
    const cookieHeader = socket.handshake.headers.cookie;
    const cookies = parseCookies(cookieHeader);
    
    // Support retrieving token from cookies, auth payloads, or query strings
    let token = cookies.accessToken || socket.handshake.auth?.token || socket.handshake.query?.token;

    if (typeof token === 'string' && token.startsWith('Bearer ')) {
      token = token.slice(7);
    }

    if (!token || typeof token !== 'string') {
      logger.warn(`[SocketAuth] Handshake rejected: Token missing. Socket ID: ${socket.id}`);
      return next(new Error('Authentication error: Token missing'));
    }

    // Verify token validity
    try {
      const decoded = tokenService.verifyAccessToken(token);

      // Verify token is not blacklisted
      const isBlacklisted = await tokenService.isTokenBlacklisted(token, 'access');
      if (isBlacklisted) {
        logger.warn(`[SocketAuth] Handshake rejected: Token blacklisted. User ID: ${decoded.userId}`);
        return next(new Error('Authentication error: Session revoked'));
      }

      // Bind verified payload to socket data container
      socket.data.user = decoded;
      next();
    } catch (err) {
      logger.warn(`[SocketAuth] Handshake rejected: Token invalid or expired. Socket ID: ${socket.id}`);
      return next(new Error('Authentication error: Token expired or invalid'));
    }
  } catch (error) {
    logger.error('[SocketAuth] Middleware unexpected error:', error);
    return next(new Error('Authentication error: Internal error'));
  }
};
