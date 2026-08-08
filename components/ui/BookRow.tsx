import Link from "next/link";
import type { Source } from "@/lib/parsers/normalize";
import { SourceBadge } from "./SourceBadge";

type BookRowProps = {
  book: {
    id: string;
    title: string;
    author: string | null;
    source: Source;
    highlightCount: number;
  };
};

export function BookRow({ book }: BookRowProps) {
  return (
    <Link
      href={`/dashboard/${book.id}`}
      className="flex items-center gap-5 px-1 py-[18px] border-b border-border hover:bg-surface-2 rounded-xl transition-colors"
    >
      <div className="w-11 h-[58px] rounded shrink-0 bg-surface-2 border border-border" />
      <div className="flex-1 min-w-0">
        <div className="text-base font-medium truncate">{book.title}</div>
        <div className="text-sm text-text-2 truncate">{book.author}</div>
      </div>
      <SourceBadge source={book.source} />
      <span className="font-mono text-sm text-text-2 w-28 text-right shrink-0">
        {book.highlightCount} highlights
      </span>
    </Link>
  );
}
