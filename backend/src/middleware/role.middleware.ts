import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';

export const authorize = (...allowedRoles: ('user' | 'admin')[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }

    if (!allowedRoles.includes(req.user.role)) {
      return next(new AppError('Access denied: Insufficient permissions', 403));
    }

    next();
  };
};
