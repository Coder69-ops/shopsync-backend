-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN "aiProvider" TEXT NOT NULL DEFAULT 'GROQ';
ALTER TABLE "SystemConfig" ADD COLUMN "aiApiKey" TEXT;
