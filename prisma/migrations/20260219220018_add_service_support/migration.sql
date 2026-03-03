/*
  Warnings:

  - You are about to drop the column `temperature` on the `SystemConfig` table. All the data in the column will be lost.

*/
-- CreateEnum
CREATE TYPE "ProductType" AS ENUM ('PHYSICAL', 'SERVICE', 'DIGITAL');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "appointmentDate" TIMESTAMP(3),
ADD COLUMN     "serviceNotes" TEXT;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "type" "ProductType" NOT NULL DEFAULT 'PHYSICAL';

-- AlterTable
ALTER TABLE "SystemConfig" DROP COLUMN "temperature",
ALTER COLUMN "activeAiModel" SET DEFAULT 'llama-3.3-70b-versatile';
