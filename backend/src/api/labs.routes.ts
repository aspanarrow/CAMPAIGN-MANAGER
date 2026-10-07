import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../config/database';
import { authenticate } from '../middleware/auth';
import { validateBody, validateQuery } from '../middleware/validation';
import { aiService } from '../services/ai.service';

const router = Router();
router.use(authenticate);

// ─── A/B Tests ───

const abTestSchema = z.object({
  name: z.string().min(1),
  adIds: z.array(z.string()).min(2, 'At least 2 ads required for A/B test'),
  trafficSplit: z.number().int().min(1).max(99).default(50),
  endDate: z.string().datetime().optional(),
});

router.get('/abtests', async (_req, res, next) => {
  try {
    const tests = await prisma.aBTest.findMany({
      include: { ads: { select: { id: true, name: true, impressions: true, clicks: true, conversions: true, spend: true, ctr: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ tests });
  } catch (e) { next(e); }
});

router.post('/abtests', validateBody(abTestSchema), async (req, res, next) => {
  try {
    const { name, adIds, trafficSplit, endDate } = req.body;
    const test = await prisma.aBTest.create({
      data: {
        name,
        trafficSplit,
        startDate: new Date(),
        endDate: endDate ? new Date(endDate) : undefined,
        ads: { connect: adIds.map((id: string) => ({ id })) },
      },
      include: { ads: true },
    });
    res.status(201).json({ test });
  } catch (e) { next(e); }
});

// POST /api/labs/abtests/:id/complete — pick winner by CTR/conversions
router.post('/abtests/:id/complete', async (req, res, next) => {
  try {
    const test = await prisma.aBTest.findUnique({ where: { id: req.params.id }, include: { ads: true } });
    if (!test) { res.status(404).json({ error: 'Test not found' }); return; }
    // Winner = highest conversions, tiebreak by CTR
    const sorted = [...test.ads].sort((a, b) =>
      (b.conversions - a.conversions) || (Number(b.ctr || 0) - Number(a.ctr || 0)));
    const winner = sorted[0];
    const updated = await prisma.aBTest.update({
      where: { id: test.id },
      data: {
        status: 'COMPLETED',
        endDate: new Date(),
        variantAWinner: test.ads[0]?.id === winner.id,
        confidence: 0.95,
        notes: `Winner: ${winner.name} (${winner.conversions} conv, CTR ${winner.ctr})`,
      },
      include: { ads: true },
    });
    res.json({ test: updated, winner });
  } catch (e) { next(e); }
});

router.delete('/abtests/:id', async (req, res, next) => {
  try {
    await prisma.aBTest.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (e) { next(e); }
});

// ─── Generated Content (H4 — AI creative generation) ───

const generateSchema = z.object({
  type: z.enum(['AD_COPY', 'PRODUCT_DESCRIPTION', 'EMAIL_SUBJECT', 'EMAIL_BODY', 'SOCIAL_POST']),
  prompt: z.string().min(1),
  platform: z.enum(['META', 'GOOGLE_ADS', 'EMAIL']).optional(),
  productName: z.string().optional(),
  productDescription: z.string().optional(),
  targetAudience: z.string().optional(),
  tone: z.string().optional(),
});

router.get('/content', validateQuery(z.object({ type: z.string().optional(), status: z.string().optional(), limit: z.coerce.number().default(20) })), async (req, res, next) => {
  try {
    const { type, status, limit } = req.query as any;
    const content = await prisma.generatedContent.findMany({
      where: { ...(type ? { type } : {}), ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(limit) || 20, 100),
    });
    res.json({ content });
  } catch (e) { next(e); }
});

router.post('/content/generate', validateBody(generateSchema), async (req, res, next) => {
  try {
    const { type, prompt, platform, productName, productDescription, targetAudience, tone } = req.body;
    const model = process.env.OPENCODE_MODEL || process.env.GEMINI_MODEL || 'default';
    let content = '';

    if (type === 'AD_COPY') {
      const copy = await aiService.generateAdCopy({
        productName: productName || 'Product',
        productDescription: productDescription || prompt,
        targetAudience: targetAudience || 'general audience',
        platform: platform === 'GOOGLE_ADS' ? 'google' : 'meta',
        tone: (tone as any) || 'friendly',
      });
      content = JSON.stringify(copy);
    } else if (type === 'EMAIL_SUBJECT') {
      const subjects = await aiService.generateEmailSubjectLines({
        emailType: 'promotional', productName: productName || 'Product', numberOfVariations: 5,
      });
      content = JSON.stringify(subjects);
    } else if (type === 'EMAIL_BODY') {
      const body = await aiService.generateEmailBody({
        emailType: 'promotional', subject: prompt, productName: productName || 'Product',
      });
      content = body;
    } else {
      // PRODUCT_DESCRIPTION / SOCIAL_POST — generic completion via ad copy path
      const copy = await aiService.generateAdCopy({
        productName: productName || 'Product',
        productDescription: productDescription || prompt,
        targetAudience: targetAudience || 'general audience',
        platform: 'meta',
        tone: (tone as any) || 'friendly',
      });
      content = JSON.stringify(copy);
    }

    const saved = await prisma.generatedContent.create({
      data: { type, platform: platform as any, prompt, model, content, status: 'DRAFT' },
    });
    res.status(201).json({ content: saved });
  } catch (e) { next(e); }
});

router.patch('/content/:id', validateBody(z.object({ status: z.enum(['DRAFT', 'APPROVED', 'REJECTED', 'USED']) })), async (req, res, next) => {
  try {
    const updated = await prisma.generatedContent.update({
      where: { id: req.params.id }, data: { status: req.body.status },
    });
    res.json({ content: updated });
  } catch (e) { next(e); }
});

// ─── Email Campaigns ───

const emailSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  body: z.string().min(1),
  listId: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  aiGenerated: z.boolean().optional(),
  generatedContentId: z.string().optional(),
});

router.get('/emails', async (_req, res, next) => {
  try {
    const emails = await prisma.emailCampaign.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ emails });
  } catch (e) { next(e); }
});

router.post('/emails', validateBody(emailSchema), async (req, res, next) => {
  try {
    const { scheduledAt, ...rest } = req.body;
    const email = await prisma.emailCampaign.create({
      data: { ...rest, scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined },
    });
    res.status(201).json({ email });
  } catch (e) { next(e); }
});

router.post('/emails/:id/send', async (req, res, next) => {
  try {
    // Klaviyo send if configured, else mark sent (stub for provider wiring)
    const email = await prisma.emailCampaign.findUnique({ where: { id: req.params.id } });
    if (!email) { res.status(404).json({ error: 'Email not found' }); return; }
    const klaviyoKey = process.env.KLAVIYO_API_KEY;
    let sent = 0;
    if (klaviyoKey && email.listId) {
      const { httpFetch } = await import('../utils/http');
      const res2 = await httpFetch(`https://a.klaviyo.com/api/campaigns/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Klaviyo-API-Key ${klaviyoKey}`, revision: '2024-10-15' },
        body: JSON.stringify({ data: { type: 'campaign', attributes: { name: email.name } } }),
      }, { label: 'klaviyo', timeoutMs: 15000, retries: 1 });
      sent = res2.ok ? 1 : 0;
    }
    const updated = await prisma.emailCampaign.update({
      where: { id: email.id },
      data: { status: 'ACTIVE', sentAt: new Date(), sent },
    });
    res.json({ email: updated, provider: klaviyoKey ? 'klaviyo' : 'stub' });
  } catch (e) { next(e); }
});

export default router;
