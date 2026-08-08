-- AlterTable
ALTER TABLE "User" ADD COLUMN     "lastSyncAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "coverUrl" TEXT;
