-- CreateEnum
CREATE TYPE "BookStatus" AS ENUM ('NOT_STARTED', 'READING', 'FINISHED');

-- AlterTable
ALTER TABLE "Book" ADD COLUMN     "status" "BookStatus" NOT NULL DEFAULT 'NOT_STARTED';
