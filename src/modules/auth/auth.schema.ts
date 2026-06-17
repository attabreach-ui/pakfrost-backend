import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().min(1, 'Username is required').trim(),
  password: z.string().min(1, 'Password is required'),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export type LoginDto       = z.infer<typeof loginSchema>;
export type RefreshDto     = z.infer<typeof refreshSchema>;
export type ChangePassDto  = z.infer<typeof changePasswordSchema>;
