import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { prisma } from "@/lib/db";
import { BookRow } from "@/components/ui/BookRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dropzone } from "@/components/ui/Dropzone";
import { ExportAllButton } from "./_components/ExportAllButton";
import { ReadingOverview } from "./_components/ReadingOverview";
import {
  aggregateDailyMinutes,
  buildHeatmapCells,
  computeStreak,
  formatReadTime,
  formatRelativeDate,
  formatDate,
} from "@/lib/readingStats";

export default async function DashboardPage() {
  const user = await requireUser();
  const dbUser = await prisma.user.upsert({
    where: { email: user.email! },
    update: {},
    create: { email: user.email! },
  });

  const books = await prisma.book.findMany({
    where: { userId: dbUser.id },
    include: { _count: { select: { highlights: true } } },
    orderBy: [{ stats: { lastOpenAt: { sort: "desc", nulls: "last" } } }, { createdAt: "desc" }],
  });

  const totalHighlights = books.reduce((sum, b) => sum + b._count.highlights, 0);

  const bookStats = await prisma.bookStats.findMany({
    where: { book: { userId: dbUser.id } },
    include: {
      book: { select: { title: true } },
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
          const streak = computeStreak(dailyMinutes);
          const heatmapCells = buildHeatmapCells(dailyMinutes);

          const reading = bookStats
            .filter((b) => b.totalReadPages < b.totalPages)
            .sort((a, b) => (b.lastOpenAt?.getTime() ?? 0) - (a.lastOpenAt?.getTime() ?? 0))
            .slice(0, 5)
            .map((b) => ({
              title: b.book.title,
              pagesLabel: `${b.totalReadPages} / ${b.totalPages}`,
              pct: b.totalPages > 0 ? Math.round((b.totalReadPages / b.totalPages) * 100) : 0,
              opened: b.lastOpenAt ? formatRelativeDate(b.lastOpenAt) : "unknown",
            }));

          const finished = bookStats
            .filter((b) => b.totalReadPages >= b.totalPages)
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
          };
        })();

  if (books.length === 0) {
    return (
      <div className="w-full max-w-4xl mx-auto px-6 py-12">
        <EmptyState
          title="Your shelf is empty"
          description={"Import a KOReader metadata.<ext>.lua file to bring your highlights into one place."}
          action={
            <div className="mt-1 w-full max-w-md">
              <Dropzone />
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-12">
      <div className="flex justify-between items-end mb-7 gap-4 flex-wrap">
        <div>
          <div className="text-[26px] font-semibold mb-1">Your books</div>
          <div className="text-sm text-text-2">
            {books.length} books · {totalHighlights} highlights
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/settings"
            className="text-sm font-medium px-5 py-2.5 rounded-lg text-text-2 hover:text-text transition-opacity"
          >
            ⚙ Settings
          </Link>
          <ExportAllButton fileCount={books.length} />
        </div>
      </div>

      {readingOverview && <ReadingOverview {...readingOverview} />}

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
              source: book.source,
              status: book.status,
              highlightCount: book._count.highlights,
              coverUrl: book.coverUrl,
            }}
          />
        ))}
      </div>
    </div>
  );
}
