-- Create new enum type
CREATE TYPE "SubscriptionPlan_new" AS ENUM ('FREE', 'BASIC', 'PRO', 'PRO_TRIAL');

-- Update Shop table to use new enum
ALTER TABLE "Shop" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "Shop" ALTER COLUMN "plan" TYPE "SubscriptionPlan_new" USING ("plan"::text::"SubscriptionPlan_new");
ALTER TABLE "Shop" ALTER COLUMN "plan" SET DEFAULT 'FREE';

-- Update User table (handling drift from previous versions)
ALTER TABLE "User" ALTER COLUMN "subscriptionTier" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "subscriptionTier" TYPE "SubscriptionPlan_new" USING ("subscriptionTier"::text::"SubscriptionPlan_new");
ALTER TABLE "User" ALTER COLUMN "subscriptionTier" SET DEFAULT 'FREE';

-- Add new columns to Shop
ALTER TABLE "Shop" ADD COLUMN "customMessageLimit" INTEGER,
ADD COLUMN "customOrderLimit" INTEGER,
ADD COLUMN "customFeatures" JSONB;

-- Drop old enum type and rename new one
DROP TYPE "SubscriptionPlan";
ALTER TYPE "SubscriptionPlan_new" RENAME TO "SubscriptionPlan";

-- CreateTable
CREATE TABLE "PlanConfig" (
    "id" TEXT NOT NULL,
    "plan" "SubscriptionPlan" NOT NULL,
    "monthlyPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "messageLimit" INTEGER NOT NULL DEFAULT 50,
    "orderLimit" INTEGER NOT NULL DEFAULT 100,
    "canUseVoiceAI" BOOLEAN NOT NULL DEFAULT false,
    "canUseCourier" BOOLEAN NOT NULL DEFAULT false,
    "removeWatermark" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanConfig_plan_key" ON "PlanConfig"("plan");
