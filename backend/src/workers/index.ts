import { Worker, Queue } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';
import { metricsSyncService } from '../services/metrics-sync.service';
import { rulesEngine } from '../services/rules.service';
import { notificationService } from '../services/notification.service';

// Initialize Redis connection
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const QUEUE_NAME = 'campaign-jobs';

/** Queue shared with the scheduler. */
export const campaignQueue = new Queue(QUEUE_NAME, { connection });

/**
 * Worker for processing background jobs
 */
const worker = new Worker(
  QUEUE_NAME,
  async (job) => {
    logger.info(`Processing job: ${job.name}`, { jobId: job.id, data: job.data });

    try {
      switch (job.name) {
        case 'sync-campaign-metrics':
          await metricsSyncService.syncCampaign(job.data.campaignId);
          break;

        case 'sync-all-metrics':
          await metricsSyncService.syncAllActive();
          break;

        case 'evaluate-rules':
          await evaluateRules(job.data.campaignId);
          break;

        case 'evaluate-all-rules':
          await evaluateAllRules();
          break;

        case 'check-approvals':
          await checkPendingApprovals();
          break;

        default:
          logger.warn('Unknown job type', { jobName: job.name });
      }

      logger.info(`Job completed: ${job.name}`, { jobId: job.id });
    } catch (error: any) {
      logger.error(`Job failed: ${job.name}`, { jobId: job.id, error: error.message });
      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
    removeOnComplete: {
      count: 100,
      age: 24 * 3600, // 24 hours
    },
    removeOnFail: {
      count: 1000,
    },
  }
);

/**
 * Sync metrics then evaluate automation rules for a single campaign.
 */
async function evaluateRules(campaignId: string): Promise<void> {
  await metricsSyncService.syncCampaign(campaignId);
  const actions = await rulesEngine.evaluateCampaign(campaignId);
  logger.info('Rules evaluated', { campaignId, actions: actions.length });
}

/**
 * Evaluate rules for every active campaign.
 */
async function evaluateAllRules(): Promise<void> {
  const campaigns = await prisma.campaign.findMany({
    where: { status: 'ACTIVE', externalId: { not: null } },
    select: { id: true },
  });
  for (const c of campaigns) {
    try {
      await evaluateRules(c.id);
    } catch (error: any) {
      logger.error('Rule evaluation failed', { campaignId: c.id, error: error.message });
    }
  }
}

/**
 * Check for pending approvals and send notifications
 */
async function checkPendingApprovals(): Promise<void> {
  try {
    const approvals = await prisma.approval.findMany({
      where: { status: 'PENDING' },
      include: { campaign: true },
    });

    if (approvals.length > 0) {
      const summary = approvals
        .slice(0, 5)
        .map((a) => `• ${a.type} — ${a.campaign?.name || a.entityId}`)
        .join('\n');
      await notificationService.send({
        title: `${approvals.length} approval(s) pending`,
        message: summary,
        level: 'info',
        data: { count: approvals.length },
      });
    }
  } catch (error: any) {
    logger.error('Error checking approvals', { error: error.message });
    throw error;
  }
}

// Worker event handlers
worker.on('completed', (job) => {
  logger.info(`Job ${job.id} completed successfully`);
});

worker.on('failed', (job, err) => {
  logger.error(`Job ${job?.id} failed`, { error: err.message });
});

worker.on('error', (err) => {
  logger.error('Worker error', { error: err.message });
});

logger.info('🚀 Background worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing worker');
  await worker.close();
  await connection.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing worker');
  await worker.close();
  await connection.quit();
  process.exit(0);
});

export default worker;

