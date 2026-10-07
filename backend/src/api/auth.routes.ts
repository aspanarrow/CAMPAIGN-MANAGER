import { Router } from 'express';
import { z } from 'zod';
import { registerUser, loginUser } from '../services/auth.service';
import { authenticate } from '../middleware/auth';
import { prisma } from '../config/database';

const router = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = registerSchema.parse(req.body);
    const result = await registerUser(email, password, name);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);
    const result = await loginUser(email, password);
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// GET /api/auth/me — current user
router.get('/me', authenticate, async (req, res, next) => {
  try {
    const userId = (req as any).user?.userId;
    if (!userId) {
      res.json({ authenticated: true, legacy: true });
      return;
    }
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true, role: true, lastLoginAt: true },
    });
    res.json({ authenticated: true, user });
  } catch (error) {
    next(error);
  }
});

export default router;
