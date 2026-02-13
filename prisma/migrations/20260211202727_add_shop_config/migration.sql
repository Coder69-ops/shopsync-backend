/*
  Warnings:

  - You are about to drop the column `totalAmount` on the `Order` table. All the data in the column will be lost.
  - You are about to drop the column `systemPrompt` on the `Shop` table. All the data in the column will be lost.
  - You are about to drop the column `webhookSecret` on the `Shop` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[email]` on the table `Shop` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `email` to the `Shop` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'SENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('MANUAL', 'AI', 'WEB');

-- AlterEnum
ALTER TYPE "OrderStatus" ADD VALUE 'DELIVERED';

-- DropIndex
DROP INDEX "Shop_pageId_key";

-- AlterTable
ALTER TABLE "Order" DROP COLUMN "totalAmount",
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "items" TEXT,
ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "totalPrice" DECIMAL(65,30);

-- AlterTable
ALTER TABLE "Shop" DROP COLUMN "systemPrompt",
DROP COLUMN "webhookSecret",
ADD COLUMN     "aiConfig" JSONB,
ADD COLUMN     "confirmationTemplate" TEXT,
ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "currencySymbol" TEXT NOT NULL DEFAULT '$',
ADD COLUMN     "dateFormat" TEXT NOT NULL DEFAULT 'dd/MM/yyyy',
ADD COLUMN     "deliveryCharge" DECIMAL(65,30),
ADD COLUMN     "email" TEXT NOT NULL,
ADD COLUMN     "minOrderValue" DECIMAL(65,30),
ADD COLUMN     "ownerName" TEXT,
ADD COLUMN     "taxRate" DECIMAL(65,30) NOT NULL DEFAULT 0.0,
ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'UTC',
ALTER COLUMN "pageId" DROP NOT NULL,
ALTER COLUMN "accessToken" DROP NOT NULL;

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "audience" TEXT,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "stats" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "psid" TEXT NOT NULL,
    "name" TEXT,
    "profilePic" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "tags" TEXT[],
    "notes" TEXT,
    "shopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "facebookId" TEXT NOT NULL,
    "content" TEXT,
    "shopId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comment" (
    "id" TEXT NOT NULL,
    "facebookId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "senderName" TEXT,
    "senderPsid" TEXT,
    "content" TEXT NOT NULL,
    "aiReply" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Customer_shopId_psid_key" ON "Customer"("shopId", "psid");

-- CreateIndex
CREATE UNIQUE INDEX "Post_facebookId_key" ON "Post"("facebookId");

-- CreateIndex
CREATE UNIQUE INDEX "Comment_facebookId_key" ON "Comment"("facebookId");

-- CreateIndex
CREATE UNIQUE INDEX "Shop_email_key" ON "Shop"("email");

-- AddForeignKey
ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
