-- AlterTable
ALTER TABLE "Order" ADD COLUMN "marketingCampaignId" TEXT;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_marketingCampaignId_fkey" FOREIGN KEY ("marketingCampaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;
