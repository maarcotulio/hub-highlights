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

## Deploying to production (Vercel + hosted Supabase)

Everything above runs against the local Docker stack. To serve real users you need a
hosted Supabase project and a Vercel deployment, in this order — each step depends on
the previous one.

**1. Provision Supabase**

Create a project at [supabase.com](https://supabase.com), then link it locally:

```bash
supabase link --project-ref <project-ref>
```

Grab the connection strings and keys from Settings → API / Database:
`DATABASE_URL` (pooled, port 6543, `?pgbouncer=true`), `DIRECT_URL` (direct, port
5432), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY`.

Both connection strings embed the database password. They're stable — the host and
project-ref never change — and only break if you reset the database password from the
dashboard, which invalidates every copy of the old URL (Vercel env vars, `.env`, CI)
until you update them.

**2. Prepare the database — before any deploy**

```bash
DIRECT_URL=<direct-hosted-url> npx prisma migrate deploy
```

This must run before the app is reachable. It includes the RLS lockdown migration
(`20260809120001_lock_down_data_api`) that revokes `anon`/`authenticated` access to
every table — without it, the publishable key (shipped in the browser bundle by
design) can read `User.apiTokenHash` and everyone's highlights straight through the
Supabase Data API.

Then create the `covers` storage bucket by hand (Storage → New bucket): `public`,
2MiB limit, `image/png`/`image/jpeg`. The `[storage.buckets.covers]` block in
`supabase/config.toml` only applies to the local Docker stack — it has no effect on a
hosted project.

**3. Deploy to Vercel**

Connect the repo (or `vercel deploy --prod`). Set these as Production environment
variables *before* the first build — `NEXT_PUBLIC_*` values are baked in at build
time:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `DATABASE_URL`

`DIRECT_URL` and `SITE_URL` don't need to go to Vercel — the former is only used for
migrations (run from your machine or CI), the latter is only read by
`supabase/config.toml` for the local stack.

**4. Close the loop on Auth — needs the domain from step 3**

In the Supabase dashboard → Authentication → URL Configuration: set **Site URL** to
the production domain and add it to **Redirect URLs**.

Then configure custom SMTP (Authentication → Emails) with a real provider (Resend,
Postmark, SendGrid, …) — Supabase's built-in email sending is rate-limited too low
for real magic-link traffic.

**5. Verify**

- Sign in via magic link on the production URL.
- Upload a `metadata.<ext>.lua` file and a cover through the KOReader webhook.
- `curl` the REST endpoint with only the publishable key
  (`https://<project-ref>.supabase.co/rest/v1/User`) — it must come back empty/denied,
  confirming the RLS lockdown took effect.

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
