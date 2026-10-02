-- CreateEnum
CREATE TYPE "OrderOutcome" AS ENUM ('PENDING', 'DELIVERED', 'RTO', 'RETURNED', 'CANCELLED');

-- CreateTable
CREATE TABLE "order_economics" (
    "id" TEXT NOT NULL,
    "shopifyOrderId" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "placedAt" TIMESTAMP(3) NOT NULL,
    "campaignId" TEXT,
    "adSetId" TEXT,
    "adId" TEXT,
    "isCod" BOOLEAN NOT NULL DEFAULT false,
    "financialStatus" TEXT NOT NULL,
    "fulfillmentStatus" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "grossRevenue" DECIMAL(12,2) NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shippingCharged" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netRevenue" DECIMAL(12,2) NOT NULL,
    "cogsAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "codFeeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "packagingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "forwardShipCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "returnShipCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "rtoHandlingCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "outcome" "OrderOutcome" NOT NULL DEFAULT 'PENDING',
    "outcomeConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "contributionMargin" DECIMAL(12,2) NOT NULL,
    "dataQuality" TEXT NOT NULL DEFAULT 'complete',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "order_economics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_assumptions" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_economics_shopifyOrderId_key" ON "order_economics"("shopifyOrderId");

-- CreateIndex
CREATE INDEX "order_economics_placedAt_idx" ON "order_economics"("placedAt");

-- CreateIndex
CREATE INDEX "order_economics_campaignId_placedAt_idx" ON "order_economics"("campaignId", "placedAt");

-- CreateIndex
CREATE INDEX "order_economics_isCod_idx" ON "order_economics"("isCod");

-- CreateIndex
CREATE INDEX "order_economics_outcome_idx" ON "order_economics"("outcome");

-- CreateIndex
CREATE UNIQUE INDEX "cost_assumptions_key_key" ON "cost_assumptions"("key");
