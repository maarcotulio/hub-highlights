import { notFound } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";
import { prisma } from "@/lib/db";
import { SourceBadge } from "@/components/ui/SourceBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { BackLink } from "@/components/ui/BackLink";
import { HighlightSearch } from "./_components/HighlightSearch";
import { ExportBookButton } from "./_components/ExportBookButton";

export default async function BookDetailPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = await params;
  const user = await requireUser();
  const dbUser = await prisma.user.upsert({
    where: { email: user.email! },
    update: {},
    create: { email: user.email! },
  });

  // The userId filter here is the authorization check (does this user own
  // this book), not just "is someone logged in" — a mismatch and a missing
  // book both correctly 404 without leaking which case it was.
  const book = await prisma.book.findFirst({
    where: { id: bookId, userId: dbUser.id },
    include: { highlights: { orderBy: { highlightedAt: "asc" } } },
  });
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
