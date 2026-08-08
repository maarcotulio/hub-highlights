This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Local development (Supabase in Docker)

Phase 0 runs entirely on your machine — no hosted Supabase project needed yet. The
Supabase CLI (installed as a devDependency) drives a local Docker stack (Postgres,
Auth, Storage, Studio) based on `supabase/config.toml`.

Prerequisite: Docker must be running (Docker Desktop with WSL integration, or
Docker Engine directly in WSL — either works, this repo doesn't ship a hand-written
`docker-compose.yml` since the Supabase CLI manages its own containers).

```bash
npm install
npm run supabase:start   # starts the local stack, prints API URL / anon key / service_role key / DB URLs
```

Copy `.env.example` to `.env.local` and fill it in with the values printed above
(re-check anytime with `npm run supabase:status`):

- `NEXT_PUBLIC_SUPABASE_URL` → the API URL (e.g. `http://127.0.0.1:54321`)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` → the `anon key`
- `SUPABASE_SERVICE_ROLE_KEY` → the `service_role key`
- `DATABASE_URL` → the pooler connection string (port `54329`, add `?pgbouncer=true`)
- `DIRECT_URL` → the direct DB connection string (port `54322`)

Then apply the Prisma schema and start the app:

```bash
npx prisma migrate dev
npm run dev
```

Supabase Studio (local dashboard) runs at `http://127.0.0.1:54323`, and the local
email testing inbox for magic links at `http://127.0.0.1:54324`.

Stop the stack with `npm run supabase:stop` when you're done (data persists across
restarts; only `supabase stop --no-backup` or `supabase db reset` wipe it).

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
