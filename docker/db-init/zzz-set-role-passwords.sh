#!/bin/sh
# The supabase/postgres image creates supabase_auth_admin and
# supabase_storage_admin with NO password (CREATE USER ... LOGIN, no PASSWORD
# clause) and later revokes SUPERUSER from `postgres`, leaving `supabase_admin`
# as the only role that can still touch them. POSTGRES_PASSWORD only ever sets
# the `postgres` role's password (standard Postgres image behavior) — nothing
# else in this image assigns it to the roles GoTrue and storage-api actually
# connect as, so without this script they connect with a password against a
# role that has none and get "password authentication failed" forever, not
# intermittently.
#
# The `zzz-` prefix makes this run last (docker-entrypoint-initdb.d runs
# alphabetically), after the roles above are created.
set -eu

psql -v ON_ERROR_STOP=1 --username supabase_admin --dbname postgres <<-EOSQL
	ALTER ROLE supabase_auth_admin WITH PASSWORD '$POSTGRES_PASSWORD';
	ALTER ROLE supabase_storage_admin WITH PASSWORD '$POSTGRES_PASSWORD';
	ALTER ROLE authenticator WITH PASSWORD '$POSTGRES_PASSWORD';
EOSQL
