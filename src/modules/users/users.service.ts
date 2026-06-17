import bcrypt from 'bcryptjs';
import prisma from '../../config/database';
import { CreateUserDto, UpdateUserDto } from './users.schema';

const safeUser = {
  id: true, username: true, name: true, role: true,
  avatar: true, isActive: true, customPermissions: true, createdAt: true,
};

export async function getAllUsers() {
  return prisma.user.findMany({
    select: safeUser,
    orderBy: { createdAt: 'asc' },
  });
}

export async function getUserById(id: string) {
  return prisma.user.findUnique({ where: { id }, select: safeUser });
}

export async function createUser(data: CreateUserDto) {
  const passwordHash = await bcrypt.hash(data.password, 12);
  return prisma.user.create({
    data: {
      username:         data.username,
      passwordHash,
      name:             data.name,
      role:             data.role as any,
      avatar:           data.avatar,
      isActive:         data.isActive,
      customPermissions: data.customPermissions ?? {},
    },
    select: safeUser,
  });
}

export async function updateUser(id: string, data: UpdateUserDto) {
  return prisma.user.update({
    where: { id },
    data: {
      ...(data.name             !== undefined && { name: data.name }),
      ...(data.role             !== undefined && { role: data.role as any }),
      ...(data.avatar           !== undefined && { avatar: data.avatar }),
      ...(data.isActive         !== undefined && { isActive: data.isActive }),
      ...(data.customPermissions !== undefined && { customPermissions: data.customPermissions }),
    },
    select: safeUser,
  });
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ ok: boolean; message: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, message: 'User not found' };

  const match = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!match) return { ok: false, message: 'Current password is incorrect' };

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash } });
  return { ok: true, message: 'Password changed successfully' };
}

export async function adminSetPassword(userId: string, newPassword: string) {
  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({ where: { id: userId }, data: { passwordHash, refreshToken: null } });
}

export async function deleteUser(id: string) {
  return prisma.user.delete({ where: { id } });
}
