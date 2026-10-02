import { Router } from 'express';
import { profitService } from '../services/profit.service';
import { authenticate } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /api/profit/summary?from=&to=&campaignId=
 * KPI block + coverage % + warnings (honesty rules: coverage always shown).
 */
router.get('/summary', async (req, res, next) => {
  try {
    const { from, to, campaignId } = req.query;
    const summary = await profitService.summary(
      from as string | undefined,
      to as string | undefined,
      campaignId as string | undefined
    );
    res.json(summary);
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/profit/orders?page=&limit=&filter=
 * Drill-down: filter=cod|prepaid|rto|no_cogs
 */
router.get('/orders', async (req, res, next) => {
  try {
    const { from, to, filter } = req.query;
    const page = Number(req.query.page ?? 1);
    const limit = Math.min(Number(req.query.limit ?? 25), 100);
    const result = await profitService.orders(
      from as string | undefined,
      to as string | undefined,
      filter as string | undefined,
      page,
      limit
    );
    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

/**
 * PATCH /api/profit/orders/:id/outcome
 * Manual RTO/return marking (S1 stopgap before courier feed).
 * body: { outcome: DELIVERED|RTO|RETURNED|CANCELLED, confirmedBy? }
 */
router.patch('/orders/:id/outcome', async (req, res, next) => {
  try {
    const { outcome, confirmedBy } = req.body || {};
    const allowed = ['PENDING', 'DELIVERED', 'RTO', 'RETURNED', 'CANCELLED'];
    if (!allowed.includes(outcome)) {
      throw new AppError(`outcome must be one of ${allowed.join(', ')}`, 400);
    }
    const order = await profitService.setOutcome(req.params.id, outcome, confirmedBy);
    res.json({ order });
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/profit/campaigns?from=&to=
 * Spend vs real contribution — sorted by contribution, not ROAS.
 */
router.get('/campaigns', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    const campaigns = await profitService.campaigns(
      from as string | undefined,
      to as string | undefined
    );
    res.json({ campaigns });
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/costs  &  PUT /api/costs
 * Cost assumptions CRUD (audit-logged via service).
 */
router.get('/costs', async (_req, res, next) => {
  try {
    res.json({ assumptions: await profitService.listAssumptions() });
  } catch (error: any) {
    next(error);
  }
});

router.put('/costs', async (req, res, next) => {
  try {
    const { key, value } = req.body || {};
    if (!key || value === undefined) throw new AppError('key and value are required', 400);
    const assumption = await profitService.updateAssumption(key, Number(value));
    res.json({ assumption });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/profit/sync
 * Pull recent Shopify orders into OrderEconomics.
 */
router.post('/sync', async (req, res, next) => {
  try {
    const { since } = req.body || {};
    const synced = await profitService.syncOrders({ since });
    res.json({ synced });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/profit/recompute
 * Recompute CM after cost assumptions change.
 */
router.post('/recompute', async (req, res, next) => {
  try {
    const { from, to } = req.body || {};
    const recomputed = await profitService.recompute(from, to);
    res.json({ recomputed });
  } catch (error: any) {
    next(error);
  }
});

export default router;
