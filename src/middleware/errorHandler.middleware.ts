import { Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger';
import { sendError, sendServerError } from '../utils/response';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error(`${req.method} ${req.path} — ${err.message}`);

  // Prisma known errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002':
        sendError(res, 'A record with this value already exists (duplicate)', 409);
        return;
      case 'P2025':
        sendError(res, 'Record not found', 404);
        return;
      case 'P2003':
        sendError(res, 'Related record not found (foreign key constraint)', 400);
        return;
      default:
        sendError(res, `Database error: ${err.code}`, 400);
        return;
    }
  }

  // Prisma validation errors
  if (err instanceof Prisma.PrismaClientValidationError) {
    sendError(res, 'Invalid data provided to database', 400);
    return;
  }

  // Generic server error
  sendServerError(res, err.message || 'Something went wrong');
};
