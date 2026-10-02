import { Router } from 'express';
import { prisma } from '../config/database';
import { rulesEngine } from '../services/rules.service';
import { auditService } from '../services/audit.service';
import { AppError } from '../middleware/errorHandler';

const router = Router();

/**
 * GET /api/automation/rules
 * List all automation rules.
 */
router.get('/rules', async (_req, res, next) => {
  try {
    const rules = await prisma.automationRule.findMany({
      orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ rules });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/automation/rules
 * Create an automation rule.
 *
 * body: {
 *   name, enabled?, priority?,
 *   conditions: { metric, operator, value, days? },
 *   actions: [{ type, percentage?, requiresApproval? }]
 * }
 */
router.post('/rules', async (req, res, next) => {
  try {
    const { name, enabled, priority, conditions, actions } = req.body || {};
    if (!name || !conditions || !actions) {
      throw new AppError('name, conditions and actions are required', 400);
    }
    const rule = await prisma.automationRule.create({
      data: {
        name,
        enabled: enabled ?? true,
        priority: priority ?? 0,
        triggerType: 'PERFORMANCE_THRESHOLD',
        conditions,
        actions,
      },
    });
    await auditService.log({ action: 'RULE_CREATED', entityType: 'rule', entityId: rule.id });
    res.status(201).json({ rule });
  } catch (error: any) {
    next(error);
  }
});

/**
 * PATCH /api/automation/rules/:id
 * Update (or enable/disable) a rule.
 */
router.patch('/rules/:id', async (req, res, next) => {
  try {
    const { name, enabled, priority, conditions, actions } = req.body || {};
    const rule = await prisma.automationRule.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(enabled !== undefined ? { enabled } : {}),
        ...(priority !== undefined ? { priority } : {}),
        ...(conditions !== undefined ? { conditions } : {}),
        ...(actions !== undefined ? { actions } : {}),
      },
    });
    await auditService.log({ action: 'RULE_UPDATED', entityType: 'rule', entityId: rule.id });
    res.json({ rule });
  } catch (error: any) {
    next(error);
  }
});

/**
 * DELETE /api/automation/rules/:id
 */
router.delete('/rules/:id', async (req, res, next) => {
  try {
    await prisma.automationRule.delete({ where: { id: req.params.id } });
    await auditService.log({ action: 'RULE_DELETED', entityType: 'rule', entityId: req.params.id });
    res.json({ deleted: true });
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /api/automation/evaluate/:campaignId
 * Run the rules engine against one campaign right now.
 */
router.post('/evaluate/:campaignId', async (req, res, next) => {
  try {
    const actions = await rulesEngine.evaluateCampaign(req.params.campaignId);
    res.json({ actions });
  } catch (error: any) {
    next(error);
  }
});

/**
 * GET /api/automation/audit
 * Recent audit log entries.
 */
router.get('/audit', async (req, res, next) => {
  try {
    const logs = await auditService.list({
      entityType: req.query.entityType as string | undefined,
      entityId: req.query.entityId as string | undefined,
      limit: Number(req.query.limit ?? 100),
    });
    res.json({ logs });
  } catch (error: any) {
    next(error);
  }
});

export default router;
