import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { sendError, sendServerError } from '../utils/response';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void => {
  logger.error(`${req.method} ${req.path} — ${err.message}`);

  const prismaErr = err as any;

  // Prisma known errors
  if (prismaErr.code && prismaErr.clientVersion) {
    switch (prismaErr.code) {
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
        sendServerError(res, `Database error: ${prismaErr.code}`);
        return;
    }
  }

  // Generic server error — never leak raw messages to client
  sendServerError(res);
};
