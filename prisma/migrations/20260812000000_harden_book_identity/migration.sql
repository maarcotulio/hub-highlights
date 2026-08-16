-- Make the database, rather than application timing, the final authority for
-- a book's identity inside one user's library.

-- PostgreSQL's default unique-index semantics treat NULL values as distinct.
-- That allowed concurrent imports of an author-less book to create duplicate
-- rows despite the existing compound unique index. Abort with actionable
-- diagnostics if historical duplicates must be reconciled before tightening
-- the constraint.
DO $$
DECLARE
  duplicate_books TEXT;
BEGIN
  SELECT string_agg(
    format(
      'userId=%L title=%L author=%L source=%L ids=%s',
      duplicates."userId",
      duplicates."title",
      duplicates."author",
      duplicates."source",
      duplicates.ids
    ),
    E'\n'
  )
  INTO duplicate_books
  FROM (
    SELECT
      "userId",
      "title",
      "author",
      "source",
      array_agg("id" ORDER BY "id")::TEXT AS ids
    FROM "Book"
    GROUP BY "userId", "title", "author", "source"
    HAVING count(*) > 1
  ) AS duplicates;

  IF duplicate_books IS NOT NULL THEN
    RAISE EXCEPTION E'Cannot enforce Book title identity; duplicate rows exist:\n%', duplicate_books
      USING HINT = 'Merge or delete the listed duplicate Book rows, then deploy the migration again.';
  END IF;
END
$$;

-- The same KOReader partial-content hash may legitimately exist for different
-- users, but never for two books belonging to the same user.
DO $$
DECLARE
  duplicate_hashes TEXT;
BEGIN
  SELECT string_agg(
    format(
      'userId=%L md5=%L ids=%s',
      duplicates."userId",
      duplicates."md5",
      duplicates.ids
    ),
    E'\n'
  )
  INTO duplicate_hashes
  FROM (
    SELECT
      "userId",
      "md5",
      array_agg("id" ORDER BY "id")::TEXT AS ids
    FROM "Book"
    WHERE "md5" IS NOT NULL
    GROUP BY "userId", "md5"
    HAVING count(*) > 1
  ) AS duplicates;

  IF duplicate_hashes IS NOT NULL THEN
    RAISE EXCEPTION E'Cannot enforce Book md5 identity; duplicate rows exist:\n%', duplicate_hashes
      USING HINT = 'Merge or delete the listed duplicate Book rows, then deploy the migration again.';
  END IF;
END
$$;

DROP INDEX "Book_userId_title_author_source_key";

CREATE UNIQUE INDEX "Book_userId_title_author_source_key"
  ON "Book"("userId", "title", "author", "source") NULLS NOT DISTINCT;

CREATE UNIQUE INDEX "Book_userId_md5_key"
  ON "Book"("userId", "md5")
  WHERE "md5" IS NOT NULL;
