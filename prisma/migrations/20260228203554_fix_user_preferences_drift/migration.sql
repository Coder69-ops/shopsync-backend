-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailNotifications" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "languagePreference" TEXT NOT NULL DEFAULT 'en',
ADD COLUMN     "themePreference" TEXT NOT NULL DEFAULT 'dark';
