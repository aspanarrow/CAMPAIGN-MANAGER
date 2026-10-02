import { z } from 'zod';

/**
 * Campaign creation schema
 */
export const createCampaignSchema = z.object({
  platform: z.enum(['META', 'GOOGLE_ADS', 'EMAIL'], {
    errorMap: () => ({ message: 'Platform must be META, GOOGLE_ADS, or EMAIL' }),
  }),
  productIds: z.array(z.string()).optional(),
  budget: z.number().positive('Budget must be a positive number'),
  dailyBudget: z.number().positive('Daily budget must be a positive number').optional(),
  objective: z.string().min(1, 'Objective is required'),
  targetAudience: z.object({
    ageMin: z.number().int().min(18).max(65).optional(),
    ageMax: z.number().int().min(18).max(65).optional(),
    genders: z.array(z.number().int()).optional(),
    interests: z.array(z.string()).optional(),
    locations: z.array(z.string()).optional(),
    description: z.string().optional(),
  }).optional(),
  autoApprove: z.boolean().optional().default(false),
});

/**
 * Campaign update schema
 */
export const updateCampaignSchema = z.object({
  name: z.string().min(1).optional(),
  status: z.enum(['DRAFT', 'PENDING', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional(),
  budget: z.number().positive().optional(),
  dailyBudget: z.number().positive().optional(),
  objective: z.string().min(1).optional(),
});

/**
 * Campaign ID parameter schema
 */
export const campaignIdSchema = z.object({
  id: z.string().min(1, 'Campaign ID is required'),
});

/**
 * Approval request schema
 */
export const approveRequestSchema = z.object({
  approvedBy: z.string().min(1, 'Approved by is required'),
});

/**
 * Reject request schema
 */
export const rejectRequestSchema = z.object({
  rejectedBy: z.string().min(1, 'Rejected by is required'),
  reason: z.string().min(1, 'Rejection reason is required'),
});

/**
 * Treat empty query-string values (e.g. `?platform=`) as "not provided".
 */
const emptyToUndefined = (val: unknown) =>
  val === '' || val === undefined || val === null ? undefined : val;

/**
 * Campaign query parameters schema
 */
export const campaignQuerySchema = z.object({
  platform: z.preprocess(
    emptyToUndefined,
    z.enum(['META', 'GOOGLE_ADS', 'EMAIL']).optional()
  ),
  status: z.preprocess(
    emptyToUndefined,
    z.enum(['DRAFT', 'PENDING', 'ACTIVE', 'PAUSED', 'ARCHIVED']).optional()
  ),
  limit: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().positive().max(100).optional().default(50)
  ),
  offset: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().nonnegative().optional().default(0)
  ),
});

