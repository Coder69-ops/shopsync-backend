-- AlterTable
ALTER TABLE "SystemConfig" ADD COLUMN     "adminAlertEmailSubject" TEXT NOT NULL DEFAULT 'New Shop Registration 🏢',
ADD COLUMN     "emailSenderName" TEXT NOT NULL DEFAULT 'ShopSync',
ADD COLUMN     "emailSupportContact" TEXT NOT NULL DEFAULT 'support@komolina.store',
ADD COLUMN     "enableAdminAlerts" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "enableMerchantEmails" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "lowStockEmailSubject" TEXT NOT NULL DEFAULT '⚠️ Low Stock Alert',
ADD COLUMN     "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "newOrderEmailSubject" TEXT NOT NULL DEFAULT 'New Order Received! 🛍️',
ADD COLUMN     "welcomeEmailSubject" TEXT NOT NULL DEFAULT 'Welcome to ShopSync! 🚀';
