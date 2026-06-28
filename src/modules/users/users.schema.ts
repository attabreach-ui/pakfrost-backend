import { z } from 'zod';

const UserRole = z.enum(['admin', 'supervisor', 'operator', 'viewer']);

export const createUserSchema = z.object({
  username:         z.string().min(3).max(50).trim(),
  password:         z.string().min(6, 'Password must be at least 6 characters'),
  name:             z.string().min(1).max(100).trim(),
  role:             UserRole.default('operator'),
  avatar:           z.string().max(10).optional(),
  isActive:         z.boolean().default(true),
  customPermissions: z.record(z.boolean()).optional(),
});

export const updateUserSchema = z.object({
  name:             z.string().min(1).max(100).trim().optional(),
  role:             UserRole.optional(),
  avatar:           z.string().max(10).optional(),
  isActive:         z.boolean().optional(),
  customPermissions: z.record(z.boolean()).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword:     z.string().min(6, 'New password must be at least 6 characters'),
});

export const adminSetPasswordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

export type CreateUserDto      = z.infer<typeof createUserSchema>;
export type UpdateUserDto      = z.infer<typeof updateUserSchema>;
export type ChangePasswordDto  = z.infer<typeof changePasswordSchema>;
export type AdminSetPassDto    = z.infer<typeof adminSetPasswordSchema>;
