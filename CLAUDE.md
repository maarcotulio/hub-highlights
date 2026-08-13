# CLAUDE.md

Project context for Claude Code. Read this before working on any part of the repo.

## What the project is

Highlights Hub: a web app that imports highlights/annotations from **KOReader**, unifies them in a dashboard, and exports them as **Markdown in Obsidian format**. Target audience: readers who use Obsidian as a second brain and want their highlights there without manual work.

## Stack

* **Framework**: Next.js (App Router), TypeScript
* **Styling**: Tailwind CSS
* **Database**: PostgreSQL via Supabase
* **ORM**: Prisma
* **Auth**: Supabase Auth (email + password; no email confirmation on sign-up — password recovery is the only flow that sends mail)
* **Deploy**: two supported paths — Vercel + hosted Supabase (`docs/deploy-hosted.md`), or the whole stack in Docker on the user's own machine (`docs/deploy-self-hosted.md`). Self-hosting runs the same GoTrue/Storage services, so nothing in this file changes between them.
* **Temporary file storage**: Supabase Storage (if the original file needs to be kept)

## Commands

```bash
npm run supabase:start   # start local Supabase stack (Docker: Postgres, Auth, Storage, Studio)
npm run supabase:status  # print local API URL / anon key / service_role key / DB URLs
npm run supabase:stop    # stop the local Supabase stack
npm run dev              # dev server
npx prisma migrate dev   # apply migrations in dev
npx prisma studio        # inspect the database visually
npx prisma generate      # regenerate the client after changing the schema
npm run build            # production build
npm run test             # vitest
npm run lint             # lint

# Self-hosted production stack (app + Postgres + Auth + Storage + Caddy)
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

Local dev uses the Supabase CLI's own Docker-managed stack — driven by
`supabase/config.toml` — which is *not* the same thing as the production self-hosted
stack in `docker/`. `supabase/config.toml` governs only the CLI stack; the compose
file governs only production. Both require Docker (Desktop w/ WSL integration, or
Docker Engine in WSL) already running.

## Folder structure (target)

```text
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
    normalize.ts        # unifies the 3 accepted file types into a common RawHighlight
  /export
    toObsidianMarkdown.ts
  db.ts                  # Prisma client
/prisma
  schema.prisma
```

## Data model

```prisma
model User {
  id           String    @id @default(uuid())
  authId       String?   @unique   // Supabase Auth `sub` — the account identity
  email        String              // mutable attribute, NOT the identity
  apiTokenHash String?   @unique   // sha256 of the API token; plaintext never stored
  lastSyncAt   DateTime?
  books        Book[]
  createdAt    DateTime  @default(now())
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

### `metadata.<ext>.lua` — recommended

* Lives at `<book-name>.sdr/metadata.<ext>.lua` (e.g. `metadata.epub.lua`, `metadata.pdf.lua` — the original book file's extension is embedded in the sidecar filename), next to the book file
* KOReader generates this automatically whenever a book is opened — the most reliable source
* It's a real Lua table, not JSON — needs a Lua parser (e.g. `luaparse` + safe evaluation of the subset used, never a direct `eval`)
* Highlights live in `annotations` (recent KOReader versions) with `text`, `note`, `chapter`, `datetime`, `pageno`/`pos0`/`pos1`
* Also has `doc_props` (`title`, `authors`) — this is what makes it the recommended file: title/author are always available
* Older KOReader versions use a separate `highlight` + `bookmarks` structure — worth checking the version before assuming the format

### `<book-name>.<ext>.annotations.lua` — standalone annotations

* Same `annotations` table structure as above, handled by the same parser (`parseKoreaderMetadata`)
* No `doc_props` — book title falls back to `"Untitled"`, author to `null`, so prefer `metadata.<ext>.lua` when both are available

### `statistics.sqlite3`

* Lives at `koreader/settings/statistics.sqlite3`
* Doesn't have highlight text, only reading progress/time per session — useful for a future stats dashboard phase, not essential for the MVP

## Project conventions

* Never commit `.env` — use `.env.example` as the reference
* Every parser function must be pure (receives file content, returns an array of `RawHighlight`) and have a unit test with a real anonymized sample file in `/lib/parsers/__fixtures__`
* API routes always validate the authenticated user before touching the database
* Prisma migrations are always reviewed manually before applying in production (avoid `prisma db push` outside of local dev)

## Engineering workflow

### Small, production-ready releases

Every commit must be production-ready, independently revertible, and pass the relevant automated checks.

* Prefer the smallest independently deployable change over large batches.
* Do not leave the repository in an intermediate or broken state between commits.
* A commit should be safely revertible without requiring unrelated commits to be reverted with it.
* Do not bundle unrelated features, refactors, or fixes into the same commit.
* New features must not unnecessarily depend on unfinished features.
* Never rely on a later commit to make the current commit valid.
* Break large implementations into small, independently valid increments.
* Do not consider work complete while required CI checks are failing.

Small releases depend on automated CI: each commit should be able to reach production safely, and reverting one commit should be enough to undo a bad change.

### Continuous refactoring

Refactoring is part of implementation, not deferred cleanup.

While modifying code:

* Extract distinct concerns into focused modules, functions, or components when a clear boundary exists.
* Remove duplication when it represents the same concept or behavior.
* Simplify interfaces and abstractions when complexity grows unnecessarily.
* Prefer small, cohesive files over modules that accumulate unrelated responsibilities.
* Do not keep stacking code onto an already oversized module when a clear extraction is available.
* Avoid speculative abstractions. Prefer simple duplication over the wrong abstraction.
* Preserve externally observable behavior while refactoring and keep relevant tests passing.

Treat a file approaching roughly 500 lines as a signal to inspect its responsibilities, not as a hard limit. Cohesion and responsibility boundaries matter more than line count.

When a task contains both substantial refactoring and behavior changes, prefer separating behavior-preserving refactors from behavior changes when practical. Each resulting commit must remain independently valid and production-ready.

## Testing

Tests are part of the implementation when they protect behavior that is easy or costly to regress. Do not add tests merely to increase coverage or test count.

Use **Vitest** for unit and integration tests. Do not introduce another testing framework unless there is a concrete need.

Run the test suite with:

```bash
npm run test
```

### What must be tested

Prioritize tests for behavior with meaningful correctness, data-integrity, or security consequences.

#### Parsers

Every parser must have unit tests using real anonymized samples in `/lib/parsers/__fixtures__`.

Parser tests should cover representative real-world KOReader input, including relevant malformed, missing, optional, legacy, or unexpected fields.

The parser is a trust boundary. Never execute Lua input. Tests must preserve this invariant.

#### Normalization and deduplication

Importing the same data again must not create duplicate highlights.

Test behavior involving:

* identical highlights imported more than once
* changes in `text`
* changes in `location`
* missing optional fields
* missing dates
* missing chapter/note
* standalone annotations without `doc_props`
* normalization differences that could accidentally alter `dedupeHash`

#### Export

Markdown/Obsidian output must be deterministic for a known input.

Test relevant behavior involving:

* title and author
* highlights
* notes
* chapters
* locations
* dates
* missing optional metadata
* Markdown-sensitive characters
* ordering
* multiple highlights

Prefer testing the generated value directly instead of implementation details.

#### Security invariants

Functions enforcing authentication, authorization, redirects, request limits, API token handling, content validation, recovery flows, network destinations, or other security invariants documented in this file should have regression tests whenever practical.

Security tests should cover both the allowed path and important rejected paths.

#### Bug fixes

When a bug can be reproduced deterministically, add a focused regression test whenever practical.

Preferred workflow:

1. Reproduce the incorrect behavior.
2. Add a test that demonstrates the regression.
3. Confirm that the test fails for the expected reason.
4. Implement the smallest correct fix.
5. Confirm that the regression test passes.
6. Run the relevant existing tests.

Do not fix a reproducible bug and leave the behavior unprotected when a reasonable regression test can prevent it from returning.

#### Behavior changes

When existing behavior intentionally changes, add or update tests describing the new expected behavior.

Tests should describe externally observable behavior rather than internal implementation whenever possible.

### What usually should not be tested

Do not create low-value tests simply to increase test count or coverage.

Avoid tests whose primary purpose is checking:

* Tailwind classes or visual styling
* trivial React markup
* static text with no behavioral significance
* implementation details
* simple getters/setters or pass-through functions
* framework behavior already guaranteed by Next.js, React, Prisma, Supabase, or another dependency
* mocks whose main assertion is that other mocks were called

A small number of meaningful tests is preferable to a large brittle suite.

### Regression workflow

For a reproducible bug:

1. Identify the behavior that is actually wrong.
2. When practical, reproduce it with a focused failing test.
3. Implement the smallest correct fix.
4. Run the focused test.
5. Run the relevant surrounding tests.
6. Run the full test suite.
7. Run lint and build when the change can affect compilation, routing, configuration, or production behavior.

Do not weaken, skip, or delete a valid test merely to make a change pass.

If expected behavior intentionally changed, update the test and make the reason clear.

### Security regression testing

The **Security invariants** below are load-bearing. Each exists because of a concrete class of failure and must not silently regress.

When modifying code related to one of these invariants, inspect existing tests first and add or update regression coverage for the relevant boundary conditions.

Examples include:

* authenticated owner vs. another user
* existing resource belonging to another user vs. nonexistent resource
* valid internal redirect vs. external or malformed redirect
* valid request body vs. oversized input
* actual image content vs. spoofed filename/content type
* plaintext token vs. stored token hash
* valid recovery flow vs. reset attempt without the recovery grant
* valid private/LAN HTTP plugin endpoint vs. public HTTP destination
* safe URL vs. URL containing userinfo
* direct response vs. cross-host redirect carrying authorization

Do not simplify security code merely because the happy path continues to work.

### Test design

Keep tests:

* deterministic
* isolated
* focused on one behavior
* readable enough to serve as executable documentation
* independent of external network services whenever possible

Prefer representative input data over large mock hierarchies.

For parser tests, fixtures should represent actual KOReader structures with personal information removed.

Keep fixtures as small as possible while preserving the structure necessary to reproduce the behavior being tested.

Prefer table-driven tests when several inputs exercise the same invariant.

### Database and integration tests

Do not mock Prisma automatically.

For pure business logic, extract logic from database access when doing so results in a cleaner design and test the pure function directly.

Use integration tests when the behavior being protected genuinely depends on:

* database constraints
* ownership boundaries
* uniqueness
* transactions
* persistence behavior
* interactions between multiple database operations

Do not turn every API route into an integration test by default.

Use the cheapest test capable of reliably protecting the behavior.

### Coverage

There is **no coverage percentage target**.

Coverage is a diagnostic tool, not a goal.

A line being executed by a test does not mean the important behavior is protected.

Prioritize coverage of:

1. security boundaries
2. parsers and untrusted input
3. data integrity and deduplication
4. export transformations
5. bug regressions
6. complex business rules

Do not add meaningless tests solely to increase a coverage number.

### Before considering a change complete

For changes touching tested or reasonably testable behavior:

```bash
npm run test
npm run lint
```

For changes that can affect the production build:

```bash
npm run build
```

Do not claim tests, lint, or build pass unless they were actually run successfully.

If a required check cannot be run, state that explicitly rather than assuming it passes.

## Security invariants

Do not regress these — each one closed a real finding:

* **Resolve the user via `lib/currentUser.ts`**, never `prisma.user.upsert({ where: { email } })`. Identity is the Supabase Auth `sub` (`authId`); an email is mutable and re-registrable, so keying on it lets one account inherit another's library. `resolveDbUser` never falls back to an email lookup, not even for a legacy row with a null `authId`: sign-up runs with `enable_confirmations = false`, so registering proves nothing about owning the address.

* **Ownership is enforced in the `where` clause** (`findFirst({ where: { id, userId } })`), not by a separate check. A missing row and someone else's row must both 404.

* **API tokens are stored as sha256 only** (`lib/apiToken.ts`). Nothing may re-display a token after generation.

* **Request bodies are read through `readLimitedBody`**, never `request.arrayBuffer()` directly — untrusted `.sqlite3` files are loaded whole into sql.js's WASM heap.

* **Cover content type comes from `sniffImageType`**, never from `?filename=`. The covers bucket is public.

* **`?next=`-style redirects go through `safeNextPath`** (`lib/safeRedirect.ts`). A leading `/` is not a sufficient check: the URL parser strips tab/LF/CR *before* resolving, so `/<tab>/evil.com` collapses to `//evil.com` and changes origin — the whole control range is rejected, by code point rather than a regex holding invisible bytes. Non-string input (a repeated query param) falls back too. `/login` and `/signup` carry the value through to the post-auth redirect; `/auth/confirm` does not read one at all.

* **Sign-in reports one generic failure** (`app/login/actions.ts`) — never `"no such account"` vs `"wrong password"`, which would make the form an account-enumeration oracle. Sign-up is the sole place that confirms an address is registered; `/forgot-password` always answers `"if that address has an account…"`, whatever Supabase returned.

* **`/auth/confirm` pins the OTP type to `recovery`** and never reads it from the query string, pins the destination to `/reset-password` for the same reason, and redeems the token behind a click — link prefetching by mail clients would otherwise burn a one-time token before the user sees it.

* **Auth server actions are throttled through `lib/auth/rateLimit.ts`** (sign-in, sign-up, password reset). Supabase's own limits are per-IP, and calling it from the server puts every user behind one deployment IP — a shared bucket that neither stops a guesser nor survives one attacker exhausting it. The throttle message is identical whether or not the address has an account.

* **`/reset-password` requires the recovery grant** (`lib/auth/recoveryGrant.ts`), an httpOnly marker set only after a recovery token is redeemed, and re-checked inside the action — a page guard is navigation, not authorisation. A successful reset revokes every other session; leaving them alive would make the reset cosmetic against the case it exists for.

* **The Lua parser never evaluates** — it walks an allowlisted AST subset (`lib/parsers/koreader-lua.ts`).

* **The KOReader plugin accepts `https://` anywhere, and `http://` only for a private/LAN host** (`lib`-side equivalent lives in `plugins/hub.koplugin/hubclient.lua`). The bearer token goes out on every request, so plain `http://` to a public host is refused. The allowance covers `localhost`, `[::1]`, `127/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, and `*.local`; it exists so a self-hosted stack on a home network works without a certificate, and it stops there because those addresses can't be reached from outside that network. Two details are load-bearing: `172.16/12` is `172.16`–`172.31` only (a looser `172.%d+.` would hand the token to public space), and a URL carrying userinfo is rejected outright, since `http://192.168.1.1@evil.com` reads as private at a glance while resolving to `evil.com`. `redirect = false` stays regardless of scheme, because luasocket forwards the `Authorization` header across a cross-host redirect.

* **`upgrade-insecure-requests` and `Strict-Transport-Security` are conditional on the deployment scheme** (`lib/securityHeaders.ts`), not unconditional. A self-hosted LAN stack is served over plain `http://` because no CA issues for `192.168.x.x`; there, `upgrade-insecure-requests` would rewrite every cover request to a port nothing serves, and HSTS would pin the host to https for two years the first time it ever saw TLS. Anything that isn't explicitly `http:` — including a missing or unparseable value — keeps both headers, so a parse failure can't silently downgrade a hosted deployment. Every other hardening header is unconditional.
