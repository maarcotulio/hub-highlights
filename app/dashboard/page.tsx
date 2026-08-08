import { requireUser } from "@/lib/supabase/auth";
import { prisma } from "@/lib/db";
import { BookRow } from "@/components/ui/BookRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dropzone } from "@/components/ui/Dropzone";
import { ExportAllButton } from "./_components/ExportAllButton";

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
    orderBy: { createdAt: "desc" },
  });

  const totalHighlights = books.reduce((sum, b) => sum + b._count.highlights, 0);

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
        <ExportAllButton fileCount={books.length} />
      </div>

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
              highlightCount: book._count.highlights,
            }}
          />
        ))}
      </div>
    </div>
  );
}
