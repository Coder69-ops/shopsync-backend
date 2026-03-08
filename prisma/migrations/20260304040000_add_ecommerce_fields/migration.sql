-- AlterTable
ALTER TABLE "Shop" ADD COLUMN "wooCommerceUrl" TEXT,
ADD COLUMN "wooCommerceKey" TEXT,
ADD COLUMN "wooCommerceSecret" TEXT,
ADD COLUMN "shopifyUrl" TEXT,
ADD COLUMN "shopifyAccessToken" TEXT;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN "externalOrderId" TEXT;
