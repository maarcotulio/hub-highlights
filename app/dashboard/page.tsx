import { mockBooks, totalHighlightCount } from "@/lib/mock/books";
import { BookRow } from "@/components/ui/BookRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { Dropzone } from "@/components/ui/Dropzone";
import { Button } from "@/components/ui/Button";
import { ExportAllButton } from "./_components/ExportAllButton";

// TEMPORARY: mock data is read synchronously, so Next has nothing to suspend
// on and app/dashboard/loading.tsx never triggers. This artificial delay lets
// the loading skeleton be demoed now; remove once real data fetching lands.
async function getBooks() {
  await new Promise((r) => setTimeout(r, 400));
  return mockBooks;
}

export default async function DashboardPage() {
  const books = await getBooks();

  if (books.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <EmptyState
          title="Your shelf is empty"
          description={'Import a Kindle "My Clippings.txt" or a KOReader metadata.lua file to bring your highlights into one place.'}
          action={<Button className="mt-1">Upload your first file</Button>}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex justify-between items-end mb-7 gap-4 flex-wrap">
        <div>
          <div className="text-[26px] font-semibold mb-1">Your books</div>
          <div className="text-sm text-text-2">
            {books.length} books · {totalHighlightCount(books)} highlights
          </div>
        </div>
        <ExportAllButton fileCount={books.length} />
      </div>

      <div className="mb-8">
        <Dropzone />
      </div>

      <div>
        {books.map((book) => (
          <BookRow key={book.id} book={book} />
        ))}
      </div>
    </div>
  );
}
