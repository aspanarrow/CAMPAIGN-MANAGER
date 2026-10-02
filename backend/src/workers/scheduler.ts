import cron from 'node-cron';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { logger } from '../utils/logger';

// Initialize Redis and Queue
const connection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

const queue = new Queue('campaign-jobs', { connection });

/**
 * Scheduled Tasks
 * Runs periodic jobs for campaign management.
 *
 * Each job enqueues a single aggregate job; the worker expands it across the
 * active campaigns. This keeps the scheduler stateless and simple.
 */

// Sync all active campaign metrics every 30 minutes
cron.schedule('*/30 * * * *', async () => {
  logger.info('Scheduled: sync campaign metrics');
  try {
    await queue.add('sync-all-metrics', {});
  } catch (error: any) {
    logger.error('Error in scheduled sync', { error: error.message });
  }
});

// Evaluate automation rules daily at 2 AM (also syncs first)
cron.schedule('0 2 * * *', async () => {
  logger.info('Scheduled: evaluate automation rules');
  try {
    await queue.add('evaluate-all-rules', {});
  } catch (error: any) {
    logger.error('Error in scheduled rule evaluation', { error: error.message });
  }
});

// Check pending approvals every hour
cron.schedule('0 * * * *', async () => {
  logger.info('Scheduled: check pending approvals');
  try {
    await queue.add('check-approvals', {});
  } catch (error: any) {
    logger.error('Error checking approvals', { error: error.message });
  }
});

logger.info('📅 Scheduler started - tasks will run on schedule');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, closing scheduler');
  await connection.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, closing scheduler');
  await connection.quit();
  process.exit(0);
});

