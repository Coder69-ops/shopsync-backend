/*
  Warnings:

  - You are about to drop the column `subscriptionTier` on the `User` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[facebookId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "backupAiApiKey" TEXT,
ADD COLUMN     "backupAiModel" TEXT,
ADD COLUMN     "backupAiProvider" TEXT;

-- AlterTable
ALTER TABLE "User" DROP COLUMN "subscriptionTier",
ADD COLUMN     "facebookId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_facebookId_key" ON "User"("facebookId");
