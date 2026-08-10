import Link from "next/link";
import { requireDbUser } from "@/lib/currentUser";
import { prisma } from "@/lib/db";
import { BookRow } from "@/components/ui/BookRow";
import { EmptyState } from "@/components/ui/EmptyState";

export default async function ArchivePage() {
  const dbUser = await requireDbUser();
  const books = await prisma.book.findMany({
    where: { userId: dbUser.id, archivedAt: { not: null } },
    include: { _count: { select: { highlights: true } } },
    orderBy: [{ archivedAt: "desc" }, { createdAt: "desc" }],
  });

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-12">
      <div className="flex justify-between items-end mb-7 gap-4 flex-wrap">
        <div>
          <Link href="/dashboard" className="text-sm text-text-2 hover:text-text">
            ← Your books
          </Link>
          <h1 className="text-[26px] font-semibold mt-4 mb-1">Archived books</h1>
          <div className="text-sm text-text-2">
            {books.length} book{books.length === 1 ? "" : "s"} · Nothing has been deleted
          </div>
        </div>
      </div>

      {books.length === 0 ? (
        <EmptyState
          title="No archived books"
          description="Books you archive from your shelf will appear here. Archiving keeps their highlights, reading history, and exports available."
          action={
            <Link
              href="/dashboard"
              className="text-sm font-medium text-accent hover:underline"
            >
              Back to your books
            </Link>
          }
        />
      ) : (
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
                archived: true,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
