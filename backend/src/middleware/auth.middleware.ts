import { Request, Response, NextFunction } from 'express';
import { TokenService } from '../services/token.service';
import { AppError } from '../utils/errors';

const tokenService = new TokenService();

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let token = req.cookies.accessToken;

    // Check Authorization header as fallback
    if (!token && req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      throw new AppError('Authentication required. Please log in.', 401);
    }

    // Check if access token is blacklisted in Redis
    const isBlacklisted = await tokenService.isTokenBlacklisted(token, 'access');
    if (isBlacklisted) {
      throw new AppError('Session is invalid. Please login again.', 401);
    }

    // Verify token payload
    try {
      const decoded = tokenService.verifyAccessToken(token);
      req.user = decoded;
      next();
    } catch (err) {
      throw new AppError('Session expired or invalid token. Please login again.', 401);
    }
  } catch (error) {
    next(error);
  }
};
