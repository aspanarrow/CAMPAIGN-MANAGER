import { Request, Response, NextFunction } from 'express';
import { AppError } from './errorHandler';
import { logger } from '../utils/logger';
import { verifyToken } from '../services/auth.service';

/**
 * Authentication Middleware (C2)
 * Accepts EITHER:
 *   1. JWT Bearer token  → Authorization: Bearer <jwt>  (user login)
 *   2. Legacy API key   → x-api-key: <key>              (scripts / MCP / automation)
 */
export const authenticate = (req: Request, res: Response, next: NextFunction) => {
  try {
    // 1. Try JWT Bearer first
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const payload = verifyToken(authHeader.slice(7));
      (req as any).user = {
        userId: payload.userId,
        email: payload.email,
        role: payload.role,
        authenticated: true,
        method: 'jwt',
      };
      return next();
    }

    // 2. Fall back to legacy API key
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      throw new AppError('Authentication required. Provide Bearer token or x-api-key header.', 401, 'UNAUTHORIZED');
    }

    // Get expected API key from environment
    const expectedApiKey = process.env.API_KEY;

    if (!expectedApiKey) {
      logger.error('API_KEY environment variable not set');
      throw new AppError('Server configuration error', 500, 'CONFIG_ERROR');
    }

    // Validate API key
    if (apiKey !== expectedApiKey) {
      logger.warn('Invalid API key attempt', { ip: req.ip });
      throw new AppError('Invalid API key', 401, 'UNAUTHORIZED');
    }

    // Legacy key acts as ADMIN (service-level access for scripts/MCP)
    (req as any).user = {
      role: 'ADMIN',
      authenticated: true,
      method: 'api-key',
    };

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Role guard — require one of the given roles.
 * Usage: router.post('/x', authenticate, requireRole('ADMIN'), handler)
 */
export const requireRole = (...roles: string[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const role = (req as any).user?.role;
    if (!role || !roles.includes(role)) {
      return next(new AppError('Forbidden: insufficient permissions', 403, 'FORBIDDEN'));
    }
    next();
  };
};

/**
 * Optional authentication - doesn't fail if no API key provided
 * Useful for public endpoints that can work with or without auth
 */
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'] as string;
  const expectedApiKey = process.env.API_KEY;

  if (apiKey && expectedApiKey && apiKey === expectedApiKey) {
    (req as any).user = {
      apiKey,
      authenticated: true,
    };
  }

  next();
};

