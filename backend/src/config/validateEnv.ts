import { z } from 'zod';
import { logger } from '../utils/logger';

/**
 * Environment variable validation schema
 */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  API_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().url().optional(),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),

  // API Authentication
  API_KEY: z.string().min(1, 'API_KEY is required for authentication'),

  // Shopify
  SHOPIFY_STORE_URL: z.string().min(1, 'SHOPIFY_STORE_URL is required'),
  SHOPIFY_API_KEY: z.string().optional(),
  SHOPIFY_API_SECRET: z.string().optional(),
  SHOPIFY_ACCESS_TOKEN: z.string().min(1, 'SHOPIFY_ACCESS_TOKEN is required'),

  // Meta (Facebook/Instagram Ads)
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_ACCESS_TOKEN: z.string().optional(),
  META_AD_ACCOUNT_ID: z.string().optional(),
  META_PAGE_ID: z.string().optional(),
  META_PIXEL_ID: z.string().optional(),
  META_CUSTOM_EVENT: z.string().optional(),
  META_MIN_DAILY_BUDGET: z.coerce.number().positive().optional(),

  // Google Ads (Optional)
  GOOGLE_ADS_CLIENT_ID: z.string().optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().optional(),
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().optional(),
  GOOGLE_ADS_REFRESH_TOKEN: z.string().optional(),
  GOOGLE_ADS_CUSTOMER_ID: z.string().optional(),

  // Email Platform (Optional)
  KLAVIYO_API_KEY: z.string().optional(),
  KLAVIYO_LIST_ID: z.string().optional(),

  // AI Providers
  // Provider: 'opencode' (default) or 'gemini'
  AI_PROVIDER: z.enum(['opencode', 'gemini']).optional(),
  // OpenCode Go — OpenAI-compatible gateway
  OPENCODE_API_KEY: z.string().optional(),
  OPENCODE_BASE_URL: z.string().url().optional(),
  OPENCODE_MODEL: z.string().optional(),
  // Google Gemini (fallback)
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().optional(),

  // Feature Flags
  ENABLE_AI_CONTENT_GENERATION: z.string().transform((val) => val === 'true').default('true'),
  ENABLE_AUTO_APPROVAL: z.string().transform((val) => val === 'true').default('false'),
  AUTO_APPROVAL_THRESHOLD: z.coerce.number().int().positive().default(20),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

/**
 * Validate environment variables on startup
 */
export function validateEnv(): void {
  try {
    envSchema.parse(process.env);
    logger.info('✅ Environment variables validated successfully');

    // Non-fatal AI provider check
    const provider = (process.env.AI_PROVIDER || 'opencode').toLowerCase();
    if (provider === 'gemini') {
      if (!process.env.GEMINI_API_KEY) {
        logger.warn('⚠️  AI_PROVIDER=gemini but GEMINI_API_KEY is not set — AI features will fail');
      }
    } else if (!process.env.OPENCODE_API_KEY) {
      logger.warn(
        '⚠️  AI provider is OpenCode but OPENCODE_API_KEY is not set — AI features will fail'
      );
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((err) => ({
        variable: err.path.join('.'),
        message: err.message,
      }));

      logger.error('❌ Environment variable validation failed:');
      missingVars.forEach(({ variable, message }) => {
        logger.error(`  - ${variable}: ${message}`);
      });

      logger.error('\nPlease check your .env file and ensure all required variables are set.');
      process.exit(1);
    } else {
      logger.error('❌ Unexpected error during environment validation:', error);
      process.exit(1);
    }
  }
}

/**
 * Get validated environment variables
 */
export function getEnv() {
  return envSchema.parse(process.env);
}

