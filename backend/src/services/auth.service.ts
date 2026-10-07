import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

const JWT_SECRET = process.env.JWT_SECRET || process.env.API_KEY || 'dev-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyToken(token: string): JwtPayload {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    throw new AppError('Invalid or expired token', 401, 'UNAUTHORIZED');
  }
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Register a new user. First user becomes ADMIN automatically.
 */
export async function registerUser(email: string, password: string, name?: string) {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) {
    throw new AppError('Email already registered', 409, 'CONFLICT');
  }
  const userCount = await prisma.user.count();
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      name,
      role: userCount === 0 ? 'ADMIN' : 'VIEWER',
    },
    select: { id: true, email: true, name: true, role: true, createdAt: true },
  });
  logger.info('User registered', { email: user.email, role: user.role });
  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  return { user, token };
}

/**
 * Login with email + password.
 */
export async function loginUser(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.isActive) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }
  const ok = await comparePassword(password, user.passwordHash);
  if (!ok) {
    throw new AppError('Invalid email or password', 401, 'UNAUTHORIZED');
  }
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  const token = signToken({ userId: user.id, email: user.email, role: user.role });
  logger.info('User logged in', { email: user.email });
  return {
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
    token,
  };
}
