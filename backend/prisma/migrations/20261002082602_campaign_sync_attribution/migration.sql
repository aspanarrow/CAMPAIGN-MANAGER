-- AlterTable
ALTER TABLE "campaigns" ADD COLUMN     "lastSyncedAt" TIMESTAMP(3),
ADD COLUMN     "utmCampaign" TEXT;
