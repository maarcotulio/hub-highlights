-- Re-key User on the Supabase Auth `sub` instead of the email address, and
-- store the API token as a sha256 hash instead of plaintext.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "authId" TEXT;

-- Backfill authId from Supabase's own auth.users table, which lives in this
-- same database. Guarded by to_regclass so the migration still applies on a
-- plain Postgres (CI, a non-Supabase host) where that schema doesn't exist —
-- lib/currentUser.ts adopts any row missed here on the user's next sign-in.
DO $$
BEGIN
  IF to_regclass('auth.users') IS NOT NULL THEN
    UPDATE "User" u
       SET "authId" = a.id::text
      FROM auth.users a
     WHERE lower(a.email) = lower(u.email)
       AND u."authId" IS NULL;
  END IF;
END
$$;

-- CreateIndex
CREATE UNIQUE INDEX "User_authId_key" ON "User"("authId");

-- The email is now a mutable attribute, not the identity. Dropping the unique
-- constraint is what lets a recycled address exist on two rows (the previous
-- owner's, and the new account's) without one being able to claim the other.
DROP INDEX "User_email_key";

-- Hash any token already issued, so devices in the field keep working instead
-- of every user having to re-pair their KOReader plugin.
ALTER TABLE "User" ADD COLUMN "apiTokenHash" TEXT;
UPDATE "User"
   SET "apiTokenHash" = encode(sha256("apiToken"::bytea), 'hex')
 WHERE "apiToken" IS NOT NULL;
ALTER TABLE "User" DROP COLUMN "apiToken";

-- CreateIndex
CREATE UNIQUE INDEX "User_apiTokenHash_key" ON "User"("apiTokenHash");
