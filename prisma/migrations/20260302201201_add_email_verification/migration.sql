/*
  Warnings:

  - A unique constraint covering the columns `[shopId,platform,externalId]` on the table `Product` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('MANUAL', 'WOOCOMMERCE', 'SHOPIFY');

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "embedding" vector(768),
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "platform" "PlatformType" NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "verificationToken" TEXT,
ADD COLUMN     "verificationTokenExpires" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Product_shopId_idx" ON "Product"("shopId");

-- CreateIndex
CREATE INDEX "Product_name_idx" ON "Product"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Product_shopId_platform_externalId_key" ON "Product"("shopId", "platform", "externalId");
