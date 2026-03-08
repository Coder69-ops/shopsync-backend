-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "shopifyClientId" TEXT,
ADD COLUMN     "shopifyClientSecret" TEXT,
ADD COLUMN     "shopifyAccessTokenExpiresAt" TIMESTAMP(3);
