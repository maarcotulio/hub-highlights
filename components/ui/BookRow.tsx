import Link from "next/link";
import type { Source } from "@/lib/parsers/normalize";
import type { BookStatus } from "@/lib/bookStatus";
import { SourceBadge } from "./SourceBadge";
import { BookStatusBadge } from "./BookStatusBadge";

type BookRowProps = {
  book: {
    id: string;
    title: string;
    author: string | null;
    source: Source;
    status: BookStatus;
    highlightCount: number;
    coverUrl: string | null;
  };
};

export function BookRow({ book }: BookRowProps) {
  return (
    <Link
      href={`/dashboard/${book.id}`}
      className="flex items-center gap-5 px-1 py-[18px] border-b border-border hover:bg-surface-2 rounded-xl transition-colors"
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
      <BookStatusBadge bookId={book.id} status={book.status} />
      <SourceBadge source={book.source} />
      <span className="font-mono text-sm text-text-2 w-28 text-right shrink-0">
        {book.highlightCount} highlights
      </span>
    </Link>
  );
}
