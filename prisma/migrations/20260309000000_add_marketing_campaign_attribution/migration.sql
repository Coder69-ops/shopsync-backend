-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "revenueGenerated" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "Campaign" ADD COLUMN "ordersCount" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "marketingCampaignId" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_marketingCampaignId_fkey" FOREIGN KEY ("marketingCampaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
