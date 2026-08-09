-- Defense in depth against the Supabase Data API (PostgREST).
--
-- The app never touches PostgREST: every read and write goes through Prisma on
-- the pooled `DATABASE_URL`, as the table owner. But supabase/config.toml
-- exposes the `public` schema, so if these tables were ever granted to `anon`
-- or `authenticated`, anyone holding the publishable key — which ships in the
-- browser bundle by design — could read every row, including User.apiTokenHash
-- and the full contents of everyone's highlights.
--
-- So: revoke those roles outright, and turn RLS on as a second, independent
-- barrier. With RLS enabled and no policy defined, the default is deny-all,
-- which is exactly what we want for roles that should never arrive here. The
-- table owner Prisma connects as bypasses RLS, so the app is unaffected.

REVOKE ALL ON TABLE "User" FROM anon, authenticated;
REVOKE ALL ON TABLE "Book" FROM anon, authenticated;
REVOKE ALL ON TABLE "Highlight" FROM anon, authenticated;
REVOKE ALL ON TABLE "BookStats" FROM anon, authenticated;
REVOKE ALL ON TABLE "PageStat" FROM anon, authenticated;

ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Book" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Highlight" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BookStats" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PageStat" ENABLE ROW LEVEL SECURITY;

-- Stop future Prisma-created tables from being auto-granted to those roles,
-- so a new model doesn't quietly reopen the hole this migration just closed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
