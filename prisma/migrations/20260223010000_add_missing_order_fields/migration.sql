-- Migration: add all remaining fields missing from initial courier migration
-- Safe to run on both fresh installs and production (IF NOT EXISTS guards)

-- Add PENDING enum value (was missing from initial schema push)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
    WHERE pg_type.typname = 'OrderStatus' AND pg_enum.enumlabel = 'PENDING'
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'PENDING';
  END IF;
END $$;

-- Add remaining Order fields
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "subTotal"          DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "deliveryFee"       DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "extractedFromChat" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
