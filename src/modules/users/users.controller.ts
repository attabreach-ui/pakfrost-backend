import { Request, Response } from 'express';
import * as usersService from './users.service';
import { sendSuccess, sendCreated, sendNotFound, sendError, sendServerError } from '../../utils/response';
import { logger } from '../../utils/logger';

export async function getAll(req: Request, res: Response) {
  try {
    const users = await usersService.getAllUsers();
    sendSuccess(res, users, `${users.length} users found`);
  } catch (err) { logger.error('getAll users', err); sendServerError(res); }
}

export async function getOne(req: Request, res: Response) {
  try {
    const user = await usersService.getUserById(req.params.id);
    if (!user) return sendNotFound(res, 'User not found');
    sendSuccess(res, user);
  } catch (err) { logger.error('getOne user', err); sendServerError(res); }
}

export async function create(req: Request, res: Response) {
  try {
    const user = await usersService.createUser(req.body);
    logger.info(`User created: ${user.username}`);
    sendCreated(res, user, 'User created successfully');
  } catch (err: any) {
    if (err?.code === 'P2002') return sendError(res, 'Username already exists', 409);
    logger.error('create user', err); sendServerError(res);
  }
}

export async function update(req: Request, res: Response) {
  try {
    const user = await usersService.updateUser(req.params.id, req.body);
    sendSuccess(res, user, 'User updated');
  } catch (err: any) {
    if (err?.code === 'P2025') return sendNotFound(res, 'User not found');
    logger.error('update user', err); sendServerError(res);
  }
}

export async function changePassword(req: Request, res: Response) {
  try {
    const { currentPassword, newPassword } = req.body;
    const targetId = req.params.id || req.user!.userId;
    const result = await usersService.changePassword(targetId, currentPassword, newPassword);
    if (!result.ok) return sendError(res, result.message, 400);
    sendSuccess(res, null, result.message);
  } catch (err) { logger.error('changePassword', err); sendServerError(res); }
}

export async function adminSetPassword(req: Request, res: Response) {
  try {
    await usersService.adminSetPassword(req.params.id, req.body.newPassword);
    sendSuccess(res, null, 'Password reset by admin');
  } catch (err: any) {
    if (err?.code === 'P2025') return sendNotFound(res, 'User not found');
    logger.error('adminSetPassword', err); sendServerError(res);
  }
}

export async function remove(req: Request, res: Response) {
  try {
    if (req.params.id === req.user!.userId) return sendError(res, 'You cannot delete yourself', 400);
    await usersService.deleteUser(req.params.id);
    sendSuccess(res, null, 'User deleted');
  } catch (err: any) {
    if (err?.code === 'P2025') return sendNotFound(res, 'User not found');
    logger.error('delete user', err); sendServerError(res);
  }
}
