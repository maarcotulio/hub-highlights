# Highlights Hub

Web app that imports highlights/annotations from **KOReader**, unifies them in a
dashboard, and exports them as **Markdown in Obsidian format**. Built for readers who
use Obsidian as a second brain and want their highlights there without manual work.

<!-- TODO: record a GIF of the flow (upload → dashboard → export) and drop it here -->

## How it works

1. **Import** — upload a KOReader `metadata.<ext>.lua`, standalone
   `<book>.<ext>.annotations.lua`, or `statistics.sqlite3` (drag & drop, or let the
   [KOReader plugin](plugins/hub.koplugin/README.md) sync automatically in the
   background).
2. **Unify** — highlights, reading stats, and covers land in one dashboard, deduped
   across re-uploads, taggable, searchable.
3. **Export** — one book as `.md`, or everything as a `.zip`, formatted as Obsidian
   `> [!quote]` callouts with frontmatter.

See [`ROADMAP.md`](ROADMAP.md) for the full phase plan and what's built so far, and
[`CLAUDE.md`](CLAUDE.md) for stack/architecture details.

## Local development (Supabase in Docker)

No hosted Supabase project needed to develop locally. The Supabase CLI (installed as a
devDependency) drives a local Docker stack (Postgres, Auth, Storage, Studio) based on
`supabase/config.toml`.

Prerequisite: Docker must be running (Docker Desktop with WSL integration, or Docker
Engine directly in WSL — either works, this repo doesn't ship a hand-written
`docker-compose.yml` since the Supabase CLI manages its own containers).

```bash
npm install
npm run supabase:start   # starts the local stack, prints API URL / anon key / service_role key / DB URLs
```

Copy `.env.example` to `.env` and fill it in with the values printed above (re-check
anytime with `npm run supabase:status`):

- `NEXT_PUBLIC_SUPABASE_URL` → the API URL (e.g. `http://127.0.0.1:54321`)
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` → the publishable/anon key
- `SUPABASE_SECRET_KEY` → the service_role key
- `DATABASE_URL` → the pooled connection string (port 6543, `?pgbouncer=true`)
- `DIRECT_URL` → the direct connection string (port 5432, used for migrations)
- `SITE_URL` → the origin your browser actually uses to reach the app (matters for
  magic-link redirects)

Then apply the Prisma schema and start the app:

```bash
npx prisma migrate dev
npm run dev
```

Supabase Studio (local dashboard) runs at `http://127.0.0.1:54323`, and the local email
testing inbox for magic links at `http://127.0.0.1:54324`.

Stop the stack with `npm run supabase:stop` when you're done (data persists across
restarts; only `supabase stop --no-backup` or `supabase db reset` wipe it).

## KOReader plugin

For automatic background sync straight from your e-reader instead of manual uploads,
see [`plugins/hub.koplugin/README.md`](plugins/hub.koplugin/README.md).

## Commands

```bash
npm run supabase:start   # start local Supabase stack
npm run supabase:status  # print local API URL / anon key / service_role key / DB URLs
npm run supabase:stop    # stop the local Supabase stack
npm run dev               # dev server
npx prisma migrate dev   # apply migrations in dev
npx prisma studio        # inspect the database visually
npx prisma generate      # regenerate the client after changing the schema
npm run build             # production build
npm run lint               # lint
```
