# CLAUDE.md

Project context for Claude Code. Read this before working on any part of the repo.

## What the project is

Highlights Hub: a web app that imports highlights/annotations from **KOReader**, unifies them in a dashboard, and exports them as **Markdown in Obsidian format**. Target audience: readers who use Obsidian as a second brain and want their highlights there without manual work.

## Stack

- **Framework**: Next.js (App Router), TypeScript
- **Styling**: Tailwind CSS
- **Database**: PostgreSQL via Supabase
- **ORM**: Prisma
- **Auth**: Supabase Auth (magic link)
- **Deploy**: Vercel
- **Temporary file storage**: Supabase Storage (if the original file needs to be kept)

## Commands

```bash
npm run supabase:start   # start local Supabase stack (Docker: Postgres, Auth, Storage, Studio)
npm run supabase:status  # print local API URL / anon key / service_role key / DB URLs
npm run supabase:stop    # stop the local Supabase stack
npm run dev              # dev server
npx prisma migrate dev   # apply migrations in dev
npx prisma studio        # inspect the database visually
npx prisma generate      # regenerate the client after changing the schema
npm run build             # production build
npm run lint               # lint
```

Local dev (Phase 0) uses the Supabase CLI's own Docker-managed stack — driven by
`supabase/config.toml` — instead of a hand-written `docker-compose.yml`. Requires
Docker (Desktop w/ WSL integration, or Docker Engine in WSL) already running.

## Folder structure (target)

```
/app
  /api
    /upload            # route that receives a file and dispatches the right parser
    /export
      /[bookId]         # generates a .md for one book
      /all              # generates a .zip of everything
  /dashboard            # list of books
  /dashboard/[bookId]   # highlights for one book
  /login
/lib
  /parsers
    koreader-lua.ts     # parseKoreaderMetadata (handles both metadata.<ext>.lua and standalone <book>.<ext>.annotations.lua)
    koreader-sqlite.ts  # parseKoreaderStatistics (optional v1)
    normalize.ts         # unifies the 3 accepted file types into a common RawHighlight
  /export
    toObsidianMarkdown.ts
  db.ts                  # Prisma client
/prisma
  schema.prisma
```

## Data model

```prisma
model User {
  id         String   @id @default(uuid())
  email      String   @unique
  books      Book[]
  createdAt  DateTime @default(now())
}

model Book {
  id         String      @id @default(uuid())
  userId     String
  user       User        @relation(fields: [userId], references: [id])
  title      String
  author     String?
  source     Source
  highlights Highlight[]
  createdAt  DateTime    @default(now())

  @@unique([userId, title, author, source])
}

model Highlight {
  id            String   @id @default(uuid())
  bookId        String
  book          Book     @relation(fields: [bookId], references: [id])
  text          String
  note          String?
  location      String?
  chapter       String?
  highlightedAt DateTime?
  dedupeHash    String
  createdAt     DateTime @default(now())

  @@unique([bookId, dedupeHash])
}

enum Source {
  KOREADER
}
```

`dedupeHash` = hash (e.g. sha1) of `text + location`, computed in the parser before saving. Prevents duplicating a highlight on re-upload.

## Important parsing notes

Exactly 3 file types are accepted, all from KOReader — there is no Kindle/`.txt` support anywhere in this project.

**`metadata.<ext>.lua` — recommended**
- Lives at `<book-name>.sdr/metadata.<ext>.lua` (e.g. `metadata.epub.lua`, `metadata.pdf.lua` — the original book file's extension is embedded in the sidecar filename), next to the book file
- KOReader generates this automatically whenever a book is opened — the most reliable source
- It's a real Lua table, not JSON — needs a Lua parser (e.g. `luaparse` + safe evaluation of the subset used, never a direct `eval`)
- Highlights live in `annotations` (recent KOReader versions) with `text`, `note`, `chapter`, `datetime`, `pageno`/`pos0`/`pos1`
- Also has `doc_props` (`title`, `authors`) — this is what makes it the recommended file: title/author are always available
- Older KOReader versions use a separate `highlight` + `bookmarks` structure — worth checking the version before assuming the format

**`<book-name>.<ext>.annotations.lua` — standalone annotations**
- Same `annotations` table structure as above, handled by the same parser (`parseKoreaderMetadata`)
- No `doc_props` — book title falls back to `"Untitled"`, author to `null`, so prefer `metadata.<ext>.lua` when both are available

**`statistics.sqlite3`**
- Lives at `koreader/settings/statistics.sqlite3`
- Doesn't have highlight text, only reading progress/time per session — useful for a future stats dashboard phase, not essential for the MVP

## Project conventions

- Never commit `.env` — use `.env.example` as the reference
- Every parser function must be pure (receives file content, returns an array of `RawHighlight`) and have a unit test with a real anonymized sample file in `/lib/parsers/__fixtures__`
- API routes always validate the authenticated user before touching the database
- Prisma migrations are always reviewed manually before applying in production (avoid `prisma db push` outside of local dev)

## Roadmap reference

The full phase plan is in `ROADMAP.md` at the repo root. Before starting a new feature, check which phase it fits into.
