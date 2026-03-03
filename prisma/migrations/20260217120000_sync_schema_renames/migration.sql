-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'SUPERADMIN');

-- CreateEnum
CREATE TYPE "SubscriptionPlan" AS ENUM ('FREE', 'BASIC', 'PRO');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "onboardingCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "subscriptionTier" "SubscriptionPlan" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Shop" ADD COLUMN     "address" TEXT,
ADD COLUMN     "brandColor" TEXT DEFAULT '#6366F1',
ADD COLUMN     "emailSupport" TEXT,
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "privacyUrl" TEXT,
ADD COLUMN     "socialLinks" JSONB,
ADD COLUMN     "termsUrl" TEXT,
ADD COLUMN     "vatNumber" TEXT,
ADD COLUMN     "website" TEXT;

-- Update the role column to use the new enum
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole" USING ("role"::text::"UserRole");
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'ADMIN';

-- Update Shop plans
ALTER TABLE "Shop" ALTER COLUMN "plan" DROP DEFAULT;
ALTER TABLE "Shop" ALTER COLUMN "plan" TYPE "SubscriptionPlan" USING ("plan"::text::"SubscriptionPlan");
ALTER TABLE "Shop" ALTER COLUMN "plan" SET DEFAULT 'FREE';

-- Drop redundant enums
DROP TYPE "Plan";
DROP TYPE "Role";

