import { Router } from 'express';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { shopifyService } from '../services/shopify.service';
import campaignsRoutes from './campaigns.routes';
import approvalsRoutes from './approvals.routes';
import automationRoutes from './automation.routes';
import profitRoutes from './profit.routes';
import authRoutes from './auth.routes';
import labsRoutes from './labs.routes';
import { CampaignStatus } from '@prisma/client';

const router = Router();

// Health check (no authentication required)
router.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'shopify-marketing-ai-api' });
});

// Session check (requires a valid API key) - used by the frontend login screen
router.get('/auth/verify', authenticate, (_req, res) => {
  res.json({ authenticated: true });
});

// Auth routes (public — register/login)
router.use('/auth', authRoutes);

// All API routes below require authentication
router.use('/campaigns', authenticate, campaignsRoutes);
router.use('/approvals', authenticate, approvalsRoutes);
router.use('/automation', authenticate, automationRoutes);
router.use('/profit', authenticate, profitRoutes);
router.use('/labs', labsRoutes); // labs router applies authenticate internally

/**
 * GET /api/products
 * List products from Shopify for the campaign form picker.
 */
router.get('/products', authenticate, async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 100);
    const products = await shopifyService.getProducts(limit);
    const slim = products.map((p: any) => ({
      id: String(p.id),
      title: p.title || p.name || 'Product',
      price: p.variants?.[0]?.price ?? null,
      image: p.image?.src ?? p.images?.[0]?.src ?? null,
      handle: p.handle ?? null,
    }));
    res.json({ products: slim });
  } catch (error: any) {
    next(error);
  }
});

// Analytics endpoint (aggregated overview)
router.get('/analytics', authenticate, async (_req, res, next) => {
  try {
    const [agg, byPlatform, byStatus] = await Promise.all([
      prisma.campaign.aggregate({
        _sum: { impressions: true, clicks: true, spend: true, revenue: true },
        _count: { _all: true },
      }),
      prisma.campaign.groupBy({
        by: ['platform'],
        _sum: { spend: true, revenue: true },
        _count: { _all: true },
      }),
      prisma.campaign.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const spend = Number(agg._sum.spend || 0);
    const revenue = Number(agg._sum.revenue || 0);

    res.json({
      summary: {
        campaigns: agg._count._all,
        impressions: agg._sum.impressions || 0,
        clicks: agg._sum.clicks || 0,
        spend,
        revenue,
        roas: spend > 0 ? Number((revenue / spend).toFixed(2)) : null,
      },
      byPlatform,
      byStatus,
    });
  } catch (error: any) {
    next(error);
  }
});

export default router;

