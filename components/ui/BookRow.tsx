import Link from "next/link";
import type { BookStatus } from "@/lib/bookStatus";
import { BookStatusBadge } from "./BookStatusBadge";
import { BookArchiveButton } from "./BookArchiveButton";

type BookRowProps = {
  book: {
    id: string;
    title: string;
    author: string | null;
    status: BookStatus;
    highlightCount: number;
    coverUrl: string | null;
    archived?: boolean;
  };
};

export function BookRow({ book }: BookRowProps) {
  const archived = book.archived ?? false;

  return (
    <div className="flex items-center gap-3 sm:gap-5 flex-wrap px-1 py-[18px] border-b border-border hover:bg-surface-2 rounded-xl transition-colors">
      <Link
        href={`/dashboard/${book.id}`}
        className="flex items-center gap-3 sm:gap-5 basis-full sm:basis-auto sm:flex-1 min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {book.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={book.coverUrl}
            alt=""
            className="w-11 h-[58px] rounded shrink-0 object-cover border border-border"
          />
        ) : (
          <div className="w-11 h-[58px] rounded shrink-0 bg-surface-2 border border-border" />
        )}
        <div className="flex-1 min-w-0">
          <div className="text-base font-medium truncate">{book.title}</div>
          <div className="text-sm text-text-2 truncate">{book.author}</div>
        </div>
      </Link>
      <div className="flex items-center justify-between gap-3 w-full sm:w-auto sm:shrink-0 sm:justify-start pl-14 sm:pl-0">
        <div className="flex items-center gap-3">
          <BookStatusBadge
            bookId={book.id}
            status={book.status}
            className="hidden min-[400px]:inline-block"
          />
          <span className="font-mono text-sm text-text-2 sm:w-28 sm:text-right shrink-0">
            {book.highlightCount} highlights
          </span>
        </div>
        <BookArchiveButton bookId={book.id} bookTitle={book.title} archived={archived} />
      </div>
    </div>
  );
}
