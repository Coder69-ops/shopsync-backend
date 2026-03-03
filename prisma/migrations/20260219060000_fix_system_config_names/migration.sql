-- AlterTable
ALTER TABLE "SystemConfig" RENAME COLUMN "activeModel" TO "activeAiModel";
ALTER TABLE "SystemConfig" RENAME COLUMN "globalSystemPrompt" TO "globalPrompt";
ALTER TABLE "SystemConfig" RENAME COLUMN "defaultTrialDays" TO "trialDays";
