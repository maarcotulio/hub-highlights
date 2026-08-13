import { describe, expect, it } from "vitest";
import { BOOK_STATUS_META, BOOK_STATUS_ORDER, nextBookStatus } from "./bookStatus";

describe("nextBookStatus", () => {
  it("cycles through every public status and wraps to the start", () => {
    expect(BOOK_STATUS_ORDER.map(nextBookStatus)).toEqual([
      "READING",
      "FINISHED",
      "NOT_STARTED",
    ]);
  });

  it("exposes the labels and design tokens used by status controls", () => {
    expect(BOOK_STATUS_META).toEqual({
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
    });
  });
});
