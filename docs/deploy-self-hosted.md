# Self-hosting Highlights Hub

Everything runs in Docker on your own machine: the app, Postgres, Supabase Auth, and
Supabase Storage. Your highlights, notes, and reading stats never leave hardware you
control, and the only thing anyone on your network does is open a page.

Same app code and same Prisma schema as the [hosted path](deploy-hosted.md) — the
difference is who runs the infrastructure. That's a real trade: you take on backups,
updates, and uptime. If you'd rather not, the hosted path is a perfectly good answer.

What you *don't* take on is reimplementing security. This stack runs the same GoTrue
and Storage services as Supabase Cloud, so every invariant in [`CLAUDE.md`](../CLAUDE.md)
— the `authId` identity model, hashed API tokens, the RLS lockdown migration, the
recovery-grant flow — carries over unchanged.

---

## Read this first: choosing the URL

**This is the one decision that's expensive to undo.** Everything else in this document
is a knob you can turn later.

The stack is served under a **single origin**: one address for the app, for Auth, and
for Storage. That address gets written into five different places, and they fail in
different ways when it changes:

| Where it's written | What happens if the URL changes |
|---|---|
| **The browser bundle.** `NEXT_PUBLIC_SUPABASE_URL` is a `NEXT_PUBLIC_*` variable, so Next inlines it into the JavaScript at build time. | Needs an **image rebuild**, not a restart. Setting the variable at runtime does nothing — the old value is already compiled in. |
| **The Content-Security-Policy.** `lib/securityHeaders.ts` derives `img-src` from it. | Covers get blocked by the browser. Shows up as broken thumbnails, not as a config error. |
| **The database.** `app/api/webhook/cover/route.ts` stores each cover's **absolute** URL in `Book.coverUrl`. | Every existing cover is orphaned. **A rebuild does not fix this** — the rows have to be rewritten or the covers re-synced. |
| **GoTrue's allow-list.** `GOTRUE_SITE_URL` / `GOTRUE_URI_ALLOW_LIST`. | Password recovery links land outside the allow-list and the flow dead-ends. |
| **Every e-reader.** The plugin saves the URL into KOReader's own settings on the device. | Each device has to be reconfigured by hand. |

So pick an address you can keep, before the first build:

1. **Reserve the host's IP in your router** (DHCP reservation). An address that changes
   on its own is the usual reason this URL "breaks by itself" — plain DHCP will
   eventually hand your machine a different one.
2. **Prefer a name to a bare IP.** `http://hub.local:8000` via mDNS, or an entry in your
   router's DNS, means moving the stack to another machine later doesn't need a rebuild.
   A bare `http://192.168.1.50:8000` ties the deployment to that exact address forever.
3. **Include the port** if it isn't 80 or 443.

### http:// or https:// on a LAN

Plain `http://` is the default here, because no certificate authority will issue a
certificate for `192.168.1.50`. Two consequences worth understanding before you accept
it:

- **The KOReader plugin's API token travels in clear text** on your network. Anyone else
  on that Wi-Fi can read it, and that token grants full read/write access to your
  library. The plugin accepts `http://` **only** for private addresses
  (`192.168.x.x`, `10.x.x.x`, `172.16–31.x.x`, `127.x.x.x`, `localhost`, `[::1]`,
  `*.local`) for exactly this reason — it refuses to send credentials in the clear to a
  public host.
- **Two security headers are dropped automatically.** `upgrade-insecure-requests` would
  rewrite every cover request to a port nothing serves, and `Strict-Transport-Security`
  would pin the host to https for two years the first time it ever saw TLS. Both are
  omitted when the deployment URL is `http://` — see `lib/securityHeaders.ts`. Every
  other hardening header is unchanged.

If your reader shares Wi-Fi with people you don't trust, put a real certificate in
front of it. The practical route on a LAN is a domain you own with an A record pointing
at the private IP, plus a DNS-01 challenge — that gets a trusted certificate without
opening a single inbound port. Then set `HUB_PUBLIC_URL=https://...` and rebuild.

---

## Setup

### 1. Configure

Start by copying the example environment file:

```bash
cp docker/.env.example docker/.env
nano docker/.env  # or your preferred editor
```

Then fill in the required variables. The ones that need real thought:

#### Essential Variables

- **`HUB_PUBLIC_URL`** — the address from the section above (e.g., `http://hub.local:8000` or `https://hub.example.com`).

- **`POSTGRES_PASSWORD`** — generate a strong random password:
  ```bash
  openssl rand -hex 32
  ```
  Copy the output into your `.env` file.

- **`JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`** — these are a **set**. `ANON_KEY` and
  `SERVICE_ROLE_KEY` are JWTs signed with `JWT_SECRET`, so generate all three together
  with [Supabase's key generator](https://supabase.com/docs/guides/self-hosting/docker#securing-your-services).
  Generating them independently produces signature errors that look like something else
  entirely.

  `ANON_KEY` ships in the browser bundle by design. `SERVICE_ROLE_KEY` bypasses RLS
  completely and stays server-side.

#### SMTP Configuration

**This is critical**: sign-up and sign-in send no mail, but **password recovery does**, and it's the only way a locked-out user gets back in. There's no built-in sender to fall back on.

Configure the `SMTP_*` block with your email provider:

**Option 1: Gmail (with App Password)**

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=xxxx-xxxx-xxxx-xxxx  # Generate at https://myaccount.google.com/apppasswords
SMTP_ADMIN_EMAIL=your-email@gmail.com
SMTP_SENDER_NAME=Highlights Hub
```

1. Enable 2-Factor Authentication on your Google account
2. Generate an [App Password](https://myaccount.google.com/apppasswords) (select "Mail" and "Windows Computer")
3. Use the 16-character password above

**Option 2: SendGrid**

```env
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=SG.your-sendgrid-api-key-here
SMTP_ADMIN_EMAIL=noreply@example.com
SMTP_SENDER_NAME=Highlights Hub
```

Get your API key from the [SendGrid dashboard](https://app.sendgrid.com/settings/api_keys).

**Option 3: Local SMTP Server (Mailhog)**

For testing on your network:

```env
SMTP_HOST=mailhog
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
SMTP_ADMIN_EMAIL=noreply@hub.local
SMTP_SENDER_NAME=Highlights Hub
```

Then add Mailhog to your `docker-compose.yml`:

```yaml
mailhog:
  image: mailhog/mailhog:latest
  ports:
    - "1025:1025"  # SMTP
    - "8025:8025"  # Web UI
  networks:
    - default
```

Access the web UI at `http://localhost:8025` to see sent emails.

**Option 4: Self-hosted server (Postfix/Exim)**

```env
SMTP_HOST=mail.example.com
SMTP_PORT=587  # or 25 for local/trusted networks
SMTP_USER=app@example.com
SMTP_PASS=your-password-here
SMTP_ADMIN_EMAIL=noreply@example.com
SMTP_SENDER_NAME=Highlights Hub
```

### 2. Start

From the repo root, run exactly:

```bash
docker compose -f docker/docker-compose.yml --env-file docker/.env up -d --build
```

**Important details:**

- `--env-file docker/.env` is **not optional**. When `-f` points at a compose file in another directory, Compose does not automatically search for a `.env` next to it. Without the flag, every variable comes back empty and you get errors like `HUB_PUBLIC_URL is missing a value` even though the file is filled in.

- If you'd rather not type the full flag every time, use this alternative:
  ```bash
  cd docker
  docker compose up -d --build
  # Compose automatically picks up ./.env and ./docker-compose.yml from the current dir
  cd ..  # go back to repo root for other commands
  ```

The first build takes a few minutes and **needs network** — `prisma generate` and the
Geist webfont both fetch during it.

Startup order is enforced by the compose file: Postgres becomes healthy, then `migrate`
applies `prisma/migrations` and exits, and only then do Auth, Storage, and the app
start. A failed migration blocks the whole stack instead of bringing up an app against
a database that isn't ready.

The `covers` bucket is created automatically by the `storage-init` service — public,
2 MiB, PNG/JPEG, matching `[storage.buckets.covers]` in `supabase/config.toml`. No
dashboard step.

### 3. Open it

Go to `HUB_PUBLIC_URL` from any machine on the network and create an account at
`/signup`. That's the whole flow — there's no separate admin console to visit.

### 4. Connect your e-reader

Generate an API token at `/dashboard/settings`, then follow
[`plugins/hub.koplugin/README.md`](../plugins/hub.koplugin/README.md). The `SERVER_URL`
is the same `HUB_PUBLIC_URL`.

---

## What's in the stack, and what isn't

| Service | Role |
|---|---|
| `caddy` | The only container with a published port. Routes one origin to three backends. |
| `app` | Next.js. |
| `db` | Postgres — **must** be the `supabase/postgres` image, which ships the roles (`anon`, `authenticated`, `service_role`, `supabase_auth_admin`, `supabase_storage_admin`) and schemas that Auth, Storage, and the RLS migration all expect to exist. |
| `auth` | GoTrue: sign-in, sign-up, password recovery. |
| `storage` | Storage API: book covers, on a local volume. |
| `migrate` | One-shot `prisma migrate deploy`. |
| `storage-init` | One-shot bucket creation. Idempotent. |

Caddy's routing (`docker/Caddyfile`):

```
/auth/v1/*     → auth:9999
/storage/v1/*  → storage:5000
/*             → app:3000
```

Deliberately **not** included: PostgREST, Studio, Supavisor, analytics/vector, meta,
edge-runtime. The app reaches Postgres through Prisma and never through the Data API —
there isn't a single `.from()` call on a table in the codebase — and the browser never
talks to Supabase at all (`connect-src 'self'`) except to load cover images. Leaving
those services out removes attack surface and things to keep patched.

The RLS lockdown migration (`20260809120001_lock_down_data_api`) is still applied. With
no PostgREST it's currently belt-and-braces, and it stays that way so that adding a
Data API later can't silently expose every table.

---

## Keeping it to your own network

Only `caddy` publishes a port; every other service is on the internal compose network
and unreachable from the LAN. That leaves exactly one door, and two things worth knowing
about it:

- **Don't create a port-forward on your router.** That single click is what turns this
  from a LAN deployment into a public one — with, by default, no TLS and a plugin token
  in clear text.
- **`ufw` does not protect a published Docker port.** Docker writes its own iptables
  rules in a chain that `ufw`'s rules never see, so a published port stays reachable
  even when `ufw` says the port is denied. If you want to restrict beyond "this
  interface", set `HUB_BIND_ADDR` to your LAN IP so Caddy refuses connections arriving
  anywhere else, or write rules in `DOCKER-USER` rather than `ufw`.

`HUB_BIND_ADDR` defaults to `0.0.0.0` (every interface on the host). Setting it to your
LAN IP is the tighter option.

---

## Operating it

These are the parts Supabase Cloud would otherwise handle:

- **Backups.** Nothing does this for you. At minimum, a `pg_dump` cron job against the
  `db` container, plus a copy of the `storage-data` volume for covers. Test a restore
  once — an untested backup isn't a backup.
- **Updates.** `docker compose -f docker/docker-compose.yml --env-file docker/.env pull && ... up -d` when
  Supabase ships security fixes. Image tags are pinned in `docker/.env.example` so an
  upstream release can't change GoTrue's environment variable names underneath a working
  deployment; when you bump them, re-check the auth settings in `docker-compose.yml`
  against that release's own documentation.
- **Uptime.** Whatever restart policy and monitoring you'd give any other self-hosted
  service. The compose file sets `restart: unless-stopped`.

---

## Verifying it works

From **another machine on the network**:

1. Load `HUB_PUBLIC_URL`. Nothing on the page should point at `localhost`.
2. Create an account at `/signup`, sign out from Settings, sign back in at `/login`.
3. **Test SMTP by running "Forgot your password?" end to end** — confirms SMTP and the recovery template:
   - Enter the email you just registered
   - Check your inbox (or Mailhog if using local testing)
   - Click the recovery link and reset your password
   - Sign in again with the new password
   
   If the email doesn't arrive, check the app logs:
   ```bash
   docker compose -f docker/docker-compose.yml --env-file docker/.env logs auth
   docker compose -f docker/docker-compose.yml --env-file docker/.env logs app
   ```
   
   Common SMTP issues:
   - **Gmail**: Did you generate an [App Password](https://myaccount.google.com/apppasswords)? Regular password won't work.
   - **SendGrid**: Is your sender email address verified in SendGrid settings?
   - **Port issues**: Firewalls sometimes block SMTP ports 25/587. Try 465 (implicit TLS) if 587 doesn't work.

4. Upload a `metadata.<ext>.lua` through the dropzone.
5. Sync a cover from the plugin and **confirm the image renders**. This is the real test
   that the single-origin routing, the CSP, and the stored `coverUrl` all agree.
6. In DevTools, check the response headers: on an `http://` deployment there should be
   **no** `upgrade-insecure-requests` in the CSP and **no** `Strict-Transport-Security`.

From the host:

```bash
# PostgREST isn't in this stack, so this must NOT return data.
curl -i "$HUB_PUBLIC_URL/rest/v1/User"

# Only caddy should appear with a published port.
docker compose -f docker/docker-compose.yml --env-file docker/.env ps
```
