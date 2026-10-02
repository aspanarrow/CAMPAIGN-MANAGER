import { logger } from '../utils/logger';

/**
 * Notification Service
 *
 * Pluggable, best-effort notifications for important events (approvals pending,
 * ROAS dropped, rule triggered, budget exhausted...).
 *
 * Channels:
 *   - Always logs.
 *   - If NOTIFY_WEBHOOK_URL is set, POSTs a JSON payload (e.g. Slack/Discord/Telegram bridge).
 */

type NotifyLevel = 'info' | 'warn' | 'critical';

interface NotifyPayload {
  title: string;
  message: string;
  level?: NotifyLevel;
  data?: any;
}

class NotificationService {
  private webhookUrl = process.env.NOTIFY_WEBHOOK_URL || '';
  private enabled = (process.env.NOTIFY_ENABLED ?? 'true') !== 'false';

  async send(payload: NotifyPayload): Promise<void> {
    if (!this.enabled) return;

    const level = payload.level || 'info';
    const line = `[notify:${level}] ${payload.title} — ${payload.message}`;
    if (level === 'critical') logger.error(line, { data: payload.data });
    else if (level === 'warn') logger.warn(line, { data: payload.data });
    else logger.info(line, { data: payload.data });

    if (!this.webhookUrl) return;
    try {
      await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `*${payload.title}*\n${payload.message}`,
          ...payload,
        }),
      });
    } catch (error: any) {
      logger.warn('Notification webhook failed', { error: error.message });
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
