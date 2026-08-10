-- AlterTable
ALTER TABLE "Book" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Book_userId_archivedAt_idx" ON "Book"("userId", "archivedAt");
