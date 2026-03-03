-- Add courier integration fields to Shop
ALTER TABLE "Shop"
  ADD COLUMN IF NOT EXISTS "courierProvider"  TEXT,
  ADD COLUMN IF NOT EXISTS "courierApiKey"    TEXT,
  ADD COLUMN IF NOT EXISTS "courierSecretKey" TEXT,
  ADD COLUMN IF NOT EXISTS "redxToken"        TEXT,
  ADD COLUMN IF NOT EXISTS "redxStoreId"      TEXT;

-- Add RedX logistics fields to Order
ALTER TABLE "Order"
  ADD COLUMN IF NOT EXISTS "deliveryAreaId"       INTEGER,
  ADD COLUMN IF NOT EXISTS "deliveryAreaName"      TEXT,
  ADD COLUMN IF NOT EXISTS "cashCollectionAmount"  DECIMAL(65,30),
  ADD COLUMN IF NOT EXISTS "parcelWeight"          INTEGER NOT NULL DEFAULT 500,
  ADD COLUMN IF NOT EXISTS "invoiceNumber"         TEXT,
  ADD COLUMN IF NOT EXISTS "courierConsignmentId"  TEXT,
  ADD COLUMN IF NOT EXISTS "courierName"           TEXT,
  ADD COLUMN IF NOT EXISTS "shipmentStatus"        TEXT;

-- Make invoiceNumber unique (only if not already constrained)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Order_invoiceNumber_key'
  ) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_invoiceNumber_key" UNIQUE ("invoiceNumber");
  END IF;
END $$;

-- Make trackingId unique (only if not already constrained)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'Order_trackingId_key'
  ) THEN
    ALTER TABLE "Order" ADD CONSTRAINT "Order_trackingId_key" UNIQUE ("trackingId");
  END IF;
END $$;

-- Add DRAFT to OrderStatus enum if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
    WHERE pg_type.typname = 'OrderStatus' AND pg_enum.enumlabel = 'DRAFT'
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'DRAFT';
  END IF;
END $$;

-- Add RETURNED to OrderStatus enum if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
    WHERE pg_type.typname = 'OrderStatus' AND pg_enum.enumlabel = 'RETURNED'
  ) THEN
    ALTER TYPE "OrderStatus" ADD VALUE 'RETURNED';
  END IF;
END $$;
