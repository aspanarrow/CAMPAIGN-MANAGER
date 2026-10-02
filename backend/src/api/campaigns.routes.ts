import { Router } from 'express';
import { prisma } from '../config/database';
import { campaignService } from '../services/campaign.service';
import { approvalService } from '../services/approval.service';
import { aiRateLimiter } from '../middleware/rateLimiter';
import { AppError } from '../middleware/errorHandler';
import { validateBody, validateQuery, validateParams } from '../middleware/validation';
import {
  createCampaignSchema,
  updateCampaignSchema,
  campaignIdSchema,
  campaignQuerySchema,
} from '../../../shared/schemas/campaign.schema';

const router = Router();

/**
 * GET /api/campaigns
 * Get all campaigns
 */
router.get('/', validateQuery(campaignQuerySchema), async (req, res, next) => {
  try {
    const { platform, status, limit, offset } = req.query;
    const campaigns = await prisma.campaign.findMany({
      where: {
        ...(platform && { platform: platform as any }),
        ...(status && { status: status as any }),
      },
      include: {
        adSets: {
          include: {
            ads: true,
          },
        },
        _count: {
          select: {
            approvals: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Number(limit ?? 50),
      skip: Number(offset ?? 0),
    });

    res.json({ campaigns, pagination: { limit, offset, total: campaigns.length } });
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/campaigns/:id
 * Get campaign details
 */
router.get('/:id', validateParams(campaignIdSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        adSets: {
          include: {
            ads: true,
            metrics: {
              orderBy: { date: 'desc' },
              take: 30,
            },
          },
        },
        metrics: {
          orderBy: { date: 'desc' },
          take: 30,
        },
        approvals: {
          where: { status: 'PENDING' },
        },
      },
    });

    if (!campaign) {
      throw new AppError('Campaign not found', 404);
    }

    res.json({ campaign });
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/campaigns/:id/timeseries
 * Get day-by-day metrics for charts (default last 30 days).
 */
router.get('/:id/timeseries', validateParams(campaignIdSchema), async (req, res, next) => {
  try {
    const days = Number(req.query.days ?? 30);
    const series = await campaignService.getTimeseries(req.params.id, days);
    res.json({ timeseries: series });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/campaigns/:id/sync
 * Force a fresh metric + status + attribution sync.
 */
router.post('/:id/sync', validateParams(campaignIdSchema), async (req, res, next) => {
  try {
    await campaignService.syncCampaign(req.params.id);
    const campaign = await prisma.campaign.findUnique({ where: { id: req.params.id } });
    res.json({ synced: true, campaign });
  } catch (error: any) {
    next(error);
  }
});

/**
 * PATCH /api/campaigns/:id
 * Update campaign (name / dailyBudget / status). Syncs to the platform.
 */
router.patch('/:id', validateParams(campaignIdSchema), async (req, res, next) => {
  try {
    const { name, dailyBudget, status } = req.body || {};
    const campaign = await campaignService.updateCampaign(req.params.id, {
      name,
      dailyBudget: typeof dailyBudget === 'number' ? dailyBudget : undefined,
      status,
    });
    res.json({ campaign });
  } catch (error: any) {
    next(error);
  }
});

/**
 * PUT /api/campaigns/:id/utm
 * Set the UTM token used for revenue attribution.
 */
router.put('/:id/utm', validateParams(campaignIdSchema), async (req, res, next) => {
  try {
    const { utmCampaign } = req.body || {};
    if (!utmCampaign) throw new AppError('utmCampaign is required', 400);
    const campaign = await campaignService.setUtmCampaign(req.params.id, utmCampaign);
    res.json({ campaign });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/campaigns
 * Create a new campaign
 */
router.post('/', aiRateLimiter, validateBody(createCampaignSchema), async (req, res, next) => {
  try {
    const {
      platform,
      productIds,
      budget,
      dailyBudget,
      objective,
      targetAudience,
      autoApprove,
    } = req.body;

    const result = await campaignService.createCampaign({
      platform,
      productIds,
      budget,
      dailyBudget,
      objective,
      targetAudience,
      autoApprove: autoApprove ?? false,
    });

    res.status(201).json(result);
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/campaigns/:id/metrics
 * Get campaign performance metrics
 */
router.get('/:id/metrics', validateParams(campaignIdSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const metrics = await campaignService.getCampaignMetrics(id);
    res.json(metrics);
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/campaigns/:id/optimize
 * Get optimization recommendations
 */
router.post('/:id/optimize', aiRateLimiter, validateParams(campaignIdSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    const optimization = await campaignService.optimizeCampaign(id);
    res.json(optimization);
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/campaigns/:id/deploy
 * Deploy campaign to platform
 */
router.post('/:id/deploy', validateParams(campaignIdSchema), async (req, res, next) => {
  try {
    const { id } = req.params;
    await campaignService.deployCampaign(id);
    res.json({ message: 'Campaign deployed successfully' });
  } catch (error: any) {
    next(error);
  }
});

export default router;

