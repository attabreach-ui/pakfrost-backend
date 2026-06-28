import { Request, Response } from 'express';
import * as authService from './auth.service';
import {
  sendSuccess, sendError, sendUnauthorized, sendServerError
} from '../../utils/response';
import { logger } from '../../utils/logger';

export async function login(req: Request, res: Response): Promise<void> {
  try {
    const { username, password } = req.body;
    const result = await authService.login(username, password);

    if (!result) {
      sendUnauthorized(res, 'Invalid username or password');
      return;
    }

    logger.info(`User logged in: ${username}`);
    sendSuccess(res, result, 'Login successful');
  } catch (err) {
    logger.error('Login error', err);
    sendServerError(res);
  }
}

export async function refresh(req: Request, res: Response): Promise<void> {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshTokens(refreshToken);

    if (!tokens) {
      sendUnauthorized(res, 'Invalid or expired refresh token');
      return;
    }

    sendSuccess(res, tokens, 'Token refreshed');
  } catch (err) {
    logger.error('Refresh error', err);
    sendServerError(res);
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  try {
    await authService.logout(req.user!.userId);
    sendSuccess(res, null, 'Logged out successfully');
  } catch (err) {
    logger.error('Logout error', err);
    sendServerError(res);
  }
}

export async function me(req: Request, res: Response): Promise<void> {
  try {
    const user = await authService.getMe(req.user!.userId);
    if (!user) {
      sendUnauthorized(res, 'User not found');
      return;
    }
    sendSuccess(res, user, 'User fetched');
  } catch (err) {
    logger.error('Me error', err);
    sendServerError(res);
  }
}

export async function verifyPassword(req: Request, res: Response): Promise<void> {
  try {
    const ok = await authService.verifyPassword(req.user!.userId, req.body.password);
    if (!ok) {
      sendError(res, 'Incorrect password', 400);
      return;
    }
    sendSuccess(res, { verified: true }, 'Password verified');
  } catch (err) {
    logger.error('Verify password error', err);
    sendServerError(res);
  }
}
