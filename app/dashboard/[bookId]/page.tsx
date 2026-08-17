import { notFound } from "next/navigation";
import { ArrowLeft, Quote } from "lucide-react";
import { requireDbUser } from "@/lib/currentUser";
import { prisma } from "@/lib/db";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { BookStatusBadge } from "@/components/ui/BookStatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackLink } from "@/components/ui/BackLink";
import { StatRow } from "@/components/ui/StatRow";
import { formatReadTime, formatDate } from "@/lib/readingStats";
import { HighlightSearch } from "./_components/HighlightSearch";
import { ExportBookButton } from "./_components/ExportBookButton";

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const dbUser = await requireDbUser();

  // The userId filter here is the authorization check (does this user own
  // this book), not just "is someone logged in" — a mismatch and a missing
  // book both correctly 404 without leaking which case it was.
  const book = await prisma.book.findFirst({
    where: { id: bookId, userId: dbUser.id },
    include: { highlights: { orderBy: { highlightedAt: "asc" } }, stats: true },
  });
  if (!book) notFound();

  return (
    <div className="w-full max-w-4xl mx-auto px-6 pt-20 pb-12 sm:pt-12">
      <BackLink href="/dashboard" className="inline-flex items-center gap-1.5 text-sm text-text-2 mb-5">
        <ArrowLeft aria-hidden="true" className="w-4 h-4" />
        All books
      </BackLink>
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 sm:gap-6 mb-2">
        <div className="flex items-start gap-4">
          {book.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverUrl}
              alt=""
              className="w-16 h-[86px] rounded shrink-0 object-cover border border-border"
            />
          )}
          <div>
            <div className="text-[26px] sm:text-[32px] font-semibold tracking-tight mb-1.5">
              {book.title}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-[15px] text-text-2">{book.author}</span>
              <BookStatusBadge bookId={book.id} status={book.status} />
              <SourceBadge source={book.source} />
            </div>
          </div>
        </div>
        <ExportBookButton
          bookId={book.id}
          bookTitle={book.title}
          disabled={book.highlights.length === 0}
        />
      </div>
      <div className="text-sm font-mono text-text-2 mb-7">
        {book.highlights.length} highlights
      </div>

      {book.stats && (
        <div className="mb-7">
          <StatRow
            cells={[
              { label: "TIME READ", value: formatReadTime(book.stats.totalReadTimeSec) },
              {
                label: "PAGES READ",
                value: `${book.stats.totalReadPages} / ${book.stats.totalPages}`,
                progressPercent:
                  book.stats.totalPages > 0
                    ? Math.round((book.stats.totalReadPages / book.stats.totalPages) * 100)
                    : 0,
              },
              {
                label: "LAST OPENED",
                value: book.stats.lastOpenAt ? formatDate(book.stats.lastOpenAt) : "—",
              },
            ]}
          />
        </div>
      )}

      {book.highlights.length === 0 ? (
        <EmptyState
          icon={<Quote aria-hidden="true" className="w-7 h-7 text-text-2" />}
          title="No highlights yet"
          description="This book was imported but has no highlights attached. Re-import its file once you've added annotations on your device."
        />
      ) : (
        <HighlightSearch highlights={book.highlights} />
      )}
    </div>
  );
}
