export type BookStatus = "NOT_STARTED" | "READING" | "FINISHED";

export const BOOK_STATUS_ORDER: BookStatus[] = ["NOT_STARTED", "READING", "FINISHED"];

export const BOOK_STATUS_META: Record<
  BookStatus,
  { label: string; slug: string; color: string; border: string; background: string }
> = {
  NOT_STARTED: {
    label: "NOT STARTED",
    slug: "not-started",
    color: "var(--text-2)",
    border: "var(--border)",
    background: "transparent",
  },
  READING: {
    label: "READING",
    slug: "reading",
    color: "var(--accent)",
    border: "var(--accent)",
    background: "transparent",
  },
  FINISHED: {
    label: "FINISHED",
    slug: "finished",
    color: "var(--text-2)",
    border: "var(--border)",
    background: "var(--surface-2)",
  },
};

export function nextBookStatus(status: BookStatus): BookStatus {
  const index = BOOK_STATUS_ORDER.indexOf(status);
  return BOOK_STATUS_ORDER[(index + 1) % BOOK_STATUS_ORDER.length];
}
