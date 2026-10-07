import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { profitService } from '../services/profit.service';

const router = Router();

/**
 * Verify Shopify webhook HMAC (C4).
 * Shopify signs the RAW request body with SHOPIFY_API_SECRET (base64 HMAC-SHA256).
 */
function verifyShopifyHmac(rawBody: Buffer, hmacHeader: string | undefined): boolean {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret || !hmacHeader) return false;
  const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(hmacHeader));
  } catch {
    return false;
  }
}

/**
 * Verify Meta webhook signature (C4).
 * Meta signs with app secret: sha256=<hex HMAC-SHA256 of raw body>.
 */
function verifyMetaSignature(rawBody: Buffer, sigHeader: string | undefined): boolean {
  const secret = process.env.META_APP_SECRET;
  if (!secret || !sigHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sigHeader));
  } catch {
    return false;
  }
}

// NOTE: these routes need the RAW body. Mounted in index.ts BEFORE express.json().

/**
 * POST /api/webhooks/shopify
 * Handles: orders/create, orders/updated, orders/cancelled, refunds/create
 */
export async function shopifyWebhookHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const rawBody = (req as any).rawBody as Buffer;
    const hmac = req.headers['x-shopify-hmac-sha256'] as string | undefined;
    const topic = req.headers['x-shopify-topic'] as string | undefined;
    const shopDomain = req.headers['x-shopify-shop-domain'] as string | undefined;

    if (!verifyShopifyHmac(rawBody, hmac)) {
      logger.warn('Shopify webhook HMAC verification failed', { topic, shopDomain });
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    logger.info('Shopify webhook received', { topic, orderId: payload.id });

    // Sync the order into OrderEconomics
    if (topic?.startsWith('orders/') || topic === 'refunds/create') {
      try {
        await profitService.syncOrders({ limit: 5 });
      } catch (err: any) {
        logger.warn('Profit sync after webhook failed', { error: err.message });
      }
    }

    await prisma.auditLog.create({
      data: {
        action: `webhook.shopify.${topic}`,
        entityType: 'shopify_order',
        entityId: String(payload.id ?? payload.order_id ?? ''),
        metadata: { shopDomain, topic } as any,
      },
    }).catch(() => {});

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/webhooks/meta — verification handshake
 * POST /api/webhooks/meta — lead/page events
 */
export async function metaWebhookVerify(req: Request, res: Response) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN || 'glowify_verify';

  if (mode === 'subscribe' && token === expected) {
    logger.info('Meta webhook verified');
    res.status(200).send(challenge);
    return;
  }
  res.sendStatus(403);
}

export async function metaWebhookHandler(req: Request, res: Response, next: NextFunction) {
  try {
    const rawBody = (req as any).rawBody as Buffer;
    const sig = req.headers['x-hub-signature-256'] as string | undefined;

    if (!verifyMetaSignature(rawBody, sig)) {
      logger.warn('Meta webhook signature verification failed');
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    const payload = JSON.parse(rawBody.toString('utf8'));
    logger.info('Meta webhook received', { object: payload.object });

    await prisma.auditLog.create({
      data: {
        action: `webhook.meta.${payload.object}`,
        entityType: 'meta_event',
        metadata: { entries: (payload.entry || []).length } as any,
      },
    }).catch(() => {});

    res.status(200).json({ received: true });
  } catch (error) {
    next(error);
  }
}

export default router;
