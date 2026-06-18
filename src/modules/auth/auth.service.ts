import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../../config/database';
import { env } from '../../config/env';
import { JwtPayload } from '../../middleware/auth.middleware';

export interface TokenPair {
  accessToken:  string;
  refreshToken: string;
}

export interface AuthUser {
  id:               string;
  username:         string;
  name:             string;
  role:             string;
  avatar:           string | null;
  isActive:         boolean;
  customPermissions: unknown;
  createdAt:        Date;
}

// ── Token helpers ───────────────────────────────────────────────────────────

function signAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, env?.JWT_ACCESS_SECRET ?? '', {
    expiresIn: (env?.JWT_ACCESS_EXPIRY ?? '15m') as jwt.SignOptions['expiresIn'],
  });
}

function signRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, env?.JWT_REFRESH_SECRET ?? '', {
    expiresIn: (env?.JWT_REFRESH_EXPIRY ?? '7d') as jwt.SignOptions['expiresIn'],
  });
}

function buildPayload(user: { id: string; username: string; role: string }): JwtPayload {
  return { userId: user.id, username: user.username, role: user.role };
}

// ── Service methods ─────────────────────────────────────────────────────────

export async function login(
  username: string,
  password: string,
): Promise<{ tokens: TokenPair; user: AuthUser } | null> {
  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !user.isActive) return null;

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) return null;

  const payload      = buildPayload(user);
  const accessToken  = signAccessToken(payload);
  const refreshToken = signRefreshToken(payload);

  // Store hashed refresh token in DB
  const refreshHash = await bcrypt.hash(refreshToken, 8);
  await prisma.user.update({
    where: { id: user.id },
    data:  { refreshToken: refreshHash },
  });

  const { passwordHash, refreshToken: _rt, ...safeUser } = user;
  return { tokens: { accessToken, refreshToken }, user: safeUser };
}

export async function refreshTokens(
  incomingRefreshToken: string,
): Promise<TokenPair | null> {
  try {
    const payload = jwt.verify(incomingRefreshToken, env?.JWT_REFRESH_SECRET ?? '') as JwtPayload;
    const user    = await prisma.user.findUnique({ where: { id: payload.userId } });

    if (!user?.refreshToken || !user.isActive) return null;

    const isValid = await bcrypt.compare(incomingRefreshToken, user.refreshToken);
    if (!isValid) return null;

    const newPayload      = buildPayload(user);
    const newAccessToken  = signAccessToken(newPayload);
    const newRefreshToken = signRefreshToken(newPayload);

    const newRefreshHash = await bcrypt.hash(newRefreshToken, 8);
    await prisma.user.update({
      where: { id: user.id },
      data:  { refreshToken: newRefreshHash },
    });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  } catch {
    return null;
  }
}

export async function logout(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data:  { refreshToken: null },
  });
}

export async function getMe(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const { passwordHash, refreshToken, ...safeUser } = user;
  return safeUser;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}
