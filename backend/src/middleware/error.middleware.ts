import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/errors';
import { logger } from '../utils/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) => {
  if (err instanceof AppError) {
    logger.warn(`Operational error: ${err.message} (status: ${err.statusCode})`);
    return res.status(err.statusCode).json({
      status: 'error',
      message: err.message,
    });
  }

  // Unhandled programming/external dependency error
  logger.error('Unhandled Server Error: ', err);
  return res.status(500).json({
    status: 'error',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
};
