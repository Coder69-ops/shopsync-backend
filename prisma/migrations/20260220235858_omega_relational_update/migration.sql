/*
  Warnings:

  - You are about to drop the column `psid` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `items` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `pageId` on the `Shop` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[shopId,externalId,platform]` on the table `Customer` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalMsgId]` on the table `Message` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `externalId` to the `Customer` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'WHATSAPP', 'WEB');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'READ', 'FAILED');

-- DropIndex
DROP INDEX "Customer_shopId_psid_key";

-- AlterTable (Safe Migration)
ALTER TABLE "Customer" ADD COLUMN "externalId" TEXT;
UPDATE "Customer" SET "externalId" = "psid";
ALTER TABLE "Customer" DROP COLUMN "psid";
ALTER TABLE "Customer" ALTER COLUMN "externalId" SET NOT NULL;
ALTER TABLE "Customer" ADD COLUMN "platform" "Platform" NOT NULL DEFAULT 'FACEBOOK';

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "errorMessage" TEXT,
ADD COLUMN     "externalMsgId" TEXT,
ADD COLUMN     "status" "MessageStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "items";

-- AlterTable
ALTER TABLE "Shop" DROP COLUMN "pageId",
ADD COLUMN     "merchantId" TEXT,
ADD COLUMN     "platformIds" JSONB,
ADD COLUMN     "subscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT;

-- CreateTable
CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "total" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeBase" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "KnowledgeBase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_shopId_externalId_platform_key" ON "Customer"("shopId", "externalId", "platform");

-- CreateIndex
CREATE UNIQUE INDEX "Message_externalMsgId_key" ON "Message"("externalMsgId");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE INDEX "Order_shopId_status_idx" ON "Order"("shopId", "status");

-- CreateIndex
CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderItem" ADD CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeBase" ADD CONSTRAINT "KnowledgeBase_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE CASCADE ON UPDATE CASCADE;
