# Deploying to production (Vercel + hosted Supabase)

The fastest way to run this for real: Supabase manages Postgres/Auth/Storage, Vercel
runs the app. No servers to patch, but your highlights, notes, and account data live
on Supabase's infrastructure. If that's a dealbreaker, see
[`deploy-self-hosted.md`](deploy-self-hosted.md) instead — same app code, your own
Docker stack.

Local dev (see the main [`README.md`](../README.md)) runs against the Supabase CLI's
own Docker stack, so none of this is needed until you're ready to serve real users.
The steps below depend on each other in order.

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

Migrations must run before the app is reachable. They include the RLS lockdown
migration (`20260809120001_lock_down_data_api`) that revokes `anon`/`authenticated`
access to every table — without it, the publishable key (shipped in the browser
bundle by design) can read `User.apiTokenHash` and everyone's highlights straight
through the Supabase Data API.

`npm run deploy` (step 3) runs `prisma migrate deploy` automatically before every
deploy, so in normal use you don't run this by hand. To apply pending migrations on
their own — e.g. to review the output before deploying the app — run:

```bash
DIRECT_URL=<direct-hosted-url> npx prisma migrate deploy
```

⚠️ **Copy the connection string whole, from Settings → Database, each time.**
Hand-editing just the port on an old copy is how a placeholder or stale password
survives into `DIRECT_URL`/`DATABASE_URL` — Prisma then fails with `P1000:
Authentication failed`, which won't show up here; it surfaces later, at sign-in, as
"We couldn't finish setting up your account" — because by that point the Supabase
Auth call already succeeded and only the Postgres connection is failing. If you ever
hit that error in production, `DIRECT_URL=<url> npx prisma migrate status` is the
fastest way to confirm whether it's a credentials problem or a pending migration.

Then create the `covers` storage bucket by hand (Storage → New bucket): `public`,
2MiB limit, `image/png`/`image/jpeg`. The `[storage.buckets.covers]` block in
`supabase/config.toml` only applies to the local Docker stack — it has no effect on a
hosted project.

**3. Deploy to Vercel**

Connect the repo, or run `npm run deploy` — it applies pending migrations
(`prisma migrate deploy`) and only then runs `vercel deploy --prod`, so a failed
migration blocks the deploy instead of shipping code the database isn't ready for.
That means `DIRECT_URL` has to be set wherever you run `npm run deploy` (your
machine or CI), the same way as the standalone command in step 2:

```bash
DIRECT_URL=<direct-hosted-url> npm run deploy
```

Set these as Production environment variables on Vercel *before* the first build —
`NEXT_PUBLIC_*` values are baked in at build time:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `DATABASE_URL`

`DIRECT_URL` and `SITE_URL` don't need to go to Vercel — the former only has to be
set locally when you run `npm run deploy` (or CI, if migrations move there later),
the latter is only read by `supabase/config.toml` for the local stack.

**4. Close the loop on Auth — needs the domain from step 3**

In the Supabase dashboard → Authentication → URL Configuration: set **Site URL** to
the production domain and add it to **Redirect URLs**.

Then, under Authentication → Providers → Email, match the local settings in
`supabase/config.toml` — that file only governs the Docker stack, so a hosted project
keeps its own defaults until you change them:

- **Confirm email**: off. Sign-up creates the session immediately; leaving it on
  means every new account waits on an email that this app never asks anyone to send.
- **Minimum password length**: 8, matching `MIN_PASSWORD_LENGTH` in
  `lib/auth/credentials.ts`. If the project requires more than the form does, the
  form accepts a password Supabase then rejects.
- **Secure password change**: on, so a stale session can't rotate the password
  without a recent sign-in. Redeeming a recovery link counts as one.
- **Minimum interval between emails**: 60 seconds. `/forgot-password` is public and
  answers the same way for every address, so a shorter interval lets it be used to
  flood a stranger's inbox and burn your SMTP quota.

Then configure custom SMTP (Authentication → Emails) with a real provider (Resend,
Postmark, SendGrid, …). Sign-up and sign-in send nothing, but **password recovery
does** — without working SMTP, "Forgot your password?" silently goes nowhere and
locked-out users have no way back in. Supabase's built-in sender is rate-limited too
low to rely on. Upload `supabase/templates/recovery.html` as the "Reset password"
template while you're there: the default template points at a route this app doesn't
serve.

**5. Verify**

- Create an account at `/signup` on the production URL, then sign out from
  Settings and sign back in at `/login`.
- Run "Forgot your password?" end to end and confirm the email arrives and the link
  lands on `/reset-password`.
- Upload a `metadata.<ext>.lua` file and a cover through the KOReader webhook.
- `curl` the REST endpoint with only the publishable key
  (`https://<project-ref>.supabase.co/rest/v1/User`) — it must come back empty/denied,
  confirming the RLS lockdown took effect.
