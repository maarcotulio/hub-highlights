# CLAUDE.md

Project context for Claude Code. Read this before working on any part of the repo.

## What the project is

Highlights Hub: a web app that imports highlights/annotations from **KOReader** and **Kindle**, unifies them in a dashboard, and exports them as **Markdown in Obsidian format**. Target audience: readers who use Obsidian as a second brain and want their highlights there without manual work.

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
    kindle.ts           # parseKindleClippings
    koreader-lua.ts     # parseKoreaderMetadata
    koreader-sqlite.ts  # parseKoreaderStatistics (optional v1)
    normalize.ts         # unifies the 3 formats into a common RawHighlight
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
  KINDLE
  KOREADER
}
```

`dedupeHash` = hash (e.g. sha1) of `text + location`, computed in the parser before saving. Prevents duplicating a highlight on re-upload.

## Important parsing notes

**Kindle (`My Clippings.txt`)**
- Entries separated by a `==========` line
- Line 1: `Title (Author)`
- Line 2: metadata — can be a highlight, note, or bookmark; may contain page/location and date
- Line 3: empty
- Line 4: highlight text
- The same highlight can appear duplicated if the user edited the note on the device — dedupe by hash handles this
- Encoding: usually `UTF-8` with BOM — strip the BOM before parsing

**KOReader (`metadata.lua`)**
- Lives at `<book-name>.sdr/metadata.lua`, next to the book file
- It's a real Lua table, not JSON — needs a Lua parser (e.g. `luaparse` + safe evaluation of the subset used, never a direct `eval`)
- Highlights live in `annotations` (recent KOReader versions) with `text`, `note`, `chapter`, `datetime`, `pageno`/`pos0`/`pos1`
- Older KOReader versions use a separate `highlight` + `bookmarks` structure — worth checking the version before assuming the format

**KOReader (`statistics.sqlite3`)**
- Lives at `koreader/settings/statistics.sqlite3`
- Doesn't have highlight text, only reading progress/time per session — useful for a future stats dashboard phase, not essential for the MVP

## Project conventions

- Never commit `.env` — use `.env.example` as the reference
- Every parser function must be pure (receives file content, returns an array of `RawHighlight`) and have a unit test with a real anonymized sample file in `/lib/parsers/__fixtures__`
- API routes always validate the authenticated user before touching the database
- Prisma migrations are always reviewed manually before applying in production (avoid `prisma db push` outside of local dev)

## Roadmap reference

The full phase plan is in `ROADMAP.md` at the repo root. Before starting a new feature, check which phase it fits into.
