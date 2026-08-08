-- Narrow enum Source: drop unused 'KINDLE' value (project is KOReader-only,
-- no Book row has ever used it — verified before writing this migration).
CREATE TYPE "Source_new" AS ENUM ('KOREADER');
ALTER TABLE "Book" ALTER COLUMN "source" TYPE "Source_new" USING ("source"::text::"Source_new");
ALTER TYPE "Source" RENAME TO "Source_old";
ALTER TYPE "Source_new" RENAME TO "Source";
DROP TYPE "Source_old";

-- AlterTable
ALTER TABLE "User" ADD COLUMN "apiToken" TEXT;

-- AlterTable
ALTER TABLE "Book" ADD COLUMN "md5" TEXT;

-- AlterTable
ALTER TABLE "Highlight" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "BookStats" (
    "id" TEXT NOT NULL,
    "bookId" TEXT NOT NULL,
    "md5" TEXT NOT NULL,
    "totalPages" INTEGER NOT NULL,
    "totalReadTimeSec" INTEGER NOT NULL,
    "totalReadPages" INTEGER NOT NULL,
    "lastOpenAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookStats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PageStat" (
    "id" TEXT NOT NULL,
    "bookStatsId" TEXT NOT NULL,
    "page" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "durationSec" INTEGER NOT NULL,
    "totalPages" INTEGER NOT NULL,

    CONSTRAINT "PageStat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_apiToken_key" ON "User"("apiToken");

-- CreateIndex
CREATE UNIQUE INDEX "BookStats_bookId_key" ON "BookStats"("bookId");

-- CreateIndex
CREATE INDEX "PageStat_bookStatsId_startTime_idx" ON "PageStat"("bookStatsId", "startTime");

-- AddForeignKey
ALTER TABLE "BookStats" ADD CONSTRAINT "BookStats_bookId_fkey" FOREIGN KEY ("bookId") REFERENCES "Book"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PageStat" ADD CONSTRAINT "PageStat_bookStatsId_fkey" FOREIGN KEY ("bookStatsId") REFERENCES "BookStats"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
