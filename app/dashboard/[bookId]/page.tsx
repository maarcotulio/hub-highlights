import { notFound } from "next/navigation";
import { getBookById } from "@/lib/mock/books";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackLink } from "@/components/ui/BackLink";
import { HighlightSearch } from "./_components/HighlightSearch";
import { ExportBookButton } from "./_components/ExportBookButton";

// TEMPORARY: same shim as app/dashboard/page.tsx — mock data is synchronous,
// so this artificial delay is what makes loading.tsx's skeleton demoable.
// Remove once real data fetching lands.
async function getBook(bookId: string) {
  await new Promise((r) => setTimeout(r, 400));
  return getBookById(bookId);
}

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const book = await getBook(bookId);
  if (!book) notFound();

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <BackLink href="/dashboard" className="text-sm text-text-2 inline-block mb-5">
        ← All books
      </BackLink>
      <div className="flex justify-between items-start gap-6 mb-2">
        <div>
          <div className="text-[32px] font-semibold tracking-tight mb-1.5">
            {book.title}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[15px] text-text-2">{book.author}</span>
            <SourceBadge source={book.source} />
          </div>
        </div>
        <ExportBookButton
          bookTitle={book.title}
          disabled={book.highlights.length === 0}
        />
      </div>
      <div className="text-sm font-mono text-text-2 mb-7">
        {book.highlights.length} highlights
      </div>

      {book.highlights.length === 0 ? (
        <EmptyState
          icon="❝"
          title="No highlights yet"
          description="This book was imported but has no highlights attached. Re-import its file once you've added annotations on your device."
        />
      ) : (
        <HighlightSearch highlights={book.highlights} />
      )}
    </div>
  );
}
