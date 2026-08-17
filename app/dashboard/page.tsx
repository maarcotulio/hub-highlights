import Link from "next/link";
import { Archive, Settings } from "lucide-react";
import { requireDbUser } from "@/lib/currentUser";
import { prisma } from "@/lib/db";
import { BookRow } from "@/components/ui/BookRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dropzone } from "@/components/ui/Dropzone";
import { ExportAllButton } from "./_components/ExportAllButton";
import { ReadingOverview } from "./_components/ReadingOverview";
import { DashboardMobileMenu } from "./_components/DashboardMobileMenu";
import { computeReadingStreak } from "@/lib/streak";
import {
  aggregateDailyMinutes,
  buildHeatmapCells,
  formatReadTime,
  formatRelativeDate,
  formatDate,
} from "@/lib/readingStats";

export default async function DashboardPage() {
  const dbUser = await requireDbUser();

  const books = await prisma.book.findMany({
    where: { userId: dbUser.id, archivedAt: null },
    include: { _count: { select: { highlights: true } } },
    orderBy: [{ stats: { lastOpenAt: { sort: "desc", nulls: "last" } } }, { createdAt: "desc" }],
  });

  const totalHighlights = books.reduce((sum, b) => sum + b._count.highlights, 0);
  const totalBookCount = await prisma.book.count({ where: { userId: dbUser.id } });

  const bookStats = await prisma.bookStats.findMany({
    where: { book: { userId: dbUser.id } },
    include: {
      book: { select: { title: true, archivedAt: true } },
      pageStats: { select: { startTime: true, durationSec: true } },
    },
  });

  const readingOverview =
    bookStats.length === 0
      ? null
      : (() => {
          const totalTimeSec = bookStats.reduce((sum, b) => sum + b.totalReadTimeSec, 0);
          const pagesRead = bookStats.reduce((sum, b) => sum + b.totalReadPages, 0);
          const pagesTotal = bookStats.reduce((sum, b) => sum + b.totalPages, 0);

          const dailyMinutes = aggregateDailyMinutes(bookStats.flatMap((b) => b.pageStats));
          const streak = computeReadingStreak(dailyMinutes, {
            maxConsecutiveDaysOff: dbUser.maxConsecutiveDaysOff,
          });
          const heatmapCells = buildHeatmapCells(dailyMinutes);

          const reading = bookStats
            .filter((b) => b.book.archivedAt === null && b.totalReadPages < b.totalPages)
            .sort((a, b) => (b.lastOpenAt?.getTime() ?? 0) - (a.lastOpenAt?.getTime() ?? 0))
            .slice(0, 5)
            .map((b) => ({
              title: b.book.title,
              pagesLabel: `${b.totalReadPages} / ${b.totalPages}`,
              pct: b.totalPages > 0 ? Math.round((b.totalReadPages / b.totalPages) * 100) : 0,
              opened: b.lastOpenAt ? formatRelativeDate(b.lastOpenAt) : "unknown",
            }));

          const finished = bookStats
            .filter((b) => b.book.archivedAt === null && b.totalReadPages >= b.totalPages)
            .sort((a, b) => (b.lastOpenAt?.getTime() ?? 0) - (a.lastOpenAt?.getTime() ?? 0))
            .slice(0, 5)
            .map((b) => ({
              title: b.book.title,
              finishedLabel: b.lastOpenAt ? formatDate(b.lastOpenAt) : "unknown",
            }));

          return {
            totalTimeLabel: formatReadTime(totalTimeSec),
            bookCount: bookStats.length,
            streak,
            pagesRead,
            pagesTotal,
            heatmapCells,
            currentlyReading: reading,
            finished,
            archivedBookCount: bookStats.filter((b) => b.book.archivedAt !== null).length,
          };
        })();

  return (
    <div className="w-full max-w-4xl mx-auto px-6 pt-20 pb-12 sm:pt-12">
      <div className="flex justify-between items-end mb-7 gap-4 flex-wrap">
        <div>
          <div className="text-[26px] font-semibold mb-1">Your books</div>
          <div className="text-sm text-text-2">
            {books.length} books · {totalHighlights} highlights
          </div>
        </div>
        <DashboardMobileMenu totalBookCount={totalBookCount} />
        <div className="hidden min-[460px]:flex items-center gap-3 flex-wrap">
          <Link
            href="/dashboard/archive"
            className="inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg text-text-2 hover:text-text transition-opacity"
          >
            <Archive aria-hidden="true" className="w-4 h-4" />
            Archived
          </Link>
          <Link
            href="/dashboard/settings"
            className="inline-flex items-center gap-2 text-sm font-medium px-5 py-2.5 rounded-lg text-text-2 hover:text-text transition-opacity"
          >
            <Settings aria-hidden="true" className="w-4 h-4" />
            Settings
          </Link>
          {totalBookCount > 0 && <ExportAllButton fileCount={totalBookCount} />}
        </div>
      </div>

      {readingOverview && <ReadingOverview {...readingOverview} />}

      {books.length === 0 ? (
        <EmptyState
          title="Your shelf is empty"
          description={"Import a KOReader metadata.<ext>.lua file to bring your highlights into one place."}
          action={
            <div className="mt-1 w-full max-w-md">
              <Dropzone />
            </div>
          }
        />
      ) : (
        <>
          <div className="mb-8">
            <Dropzone />
          </div>

          <div>
            {books.map((book) => (
              <BookRow
                key={book.id}
                book={{
                  id: book.id,
                  title: book.title,
                  author: book.author,
                  status: book.status,
                  highlightCount: book._count.highlights,
                  coverUrl: book.coverUrl,
                  archived: false,
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
