# Highlights Hub — KOReader plugin

Background watcher for KOReader that syncs your highlights, reading stats, and book
covers to a [Highlights Hub](../../README.md) server, so you don't have to plug in
your device or manually export anything.

## Install

Copy this folder into your KOReader installation's plugin directory so it ends up at:

```
koreader/plugins/hub.koplugin/
```

(the folder itself, containing `main.lua` directly inside it — not nested one level
deeper). Restart KOReader afterwards.

## Configure

Two ways to set the server URL and API token (from `/dashboard/settings` on your
Highlights Hub deployment):

- **On-device**: open the plugin's Settings dialog (see "Where to find it" below) and
  type them in.
- **Pre-seeded via `.env`**: copy `.env.example` to `.env` in this same folder and fill
  it in before copying the plugin to your device — useful if typing on an e-reader
  keyboard is painful. Values are read once at plugin startup and written into the
  plugin's own settings; the on-device dialog still works afterwards if you'd rather
  change something without re-copying files.

  The plugin **deletes the `.env` after reading it**, so the token doesn't linger in
  clear text on a device that mounts as USB mass storage. Keep your filled-in copy on
  your computer, and never commit it — the token grants full read/write access to your
  Highlights Hub account.

### Which server URLs are accepted

The token is sent as a bearer header on every request, so the plugin will not send it
somewhere it could be read off the wire by a stranger:

- **`https://` — anywhere.** The normal case for a hosted deployment.
- **`http://` — local network addresses only**: `192.168.x.x`, `10.x.x.x`,
  `172.16.x.x`–`172.31.x.x`, `127.x.x.x`, `localhost`, `[::1]`, or an mDNS name ending
  in `.local` (e.g. `http://hub.local:8000`). This is what makes a self-hosted stack on
  your own network usable without setting up a certificate.
- **`http://` to any other host — refused**, with a message explaining why.

On `http://` inside your LAN the token *is* readable by anyone else on that network.
That's a real trade-off, not an oversight: it's bounded to addresses that can't be
reached from outside your network, which is why the allowance stops where it does. If
your reader shares Wi-Fi with people you don't trust, use `https://`.

## Where to find it

**Settings (gear icon) → Network → Highlights Hub**. Inside:

- **Force sync** — uploads changed files right away, plus backfills covers for every
  book read this calendar month.
- **Settings…** — server URL / API token.
- **Sync interval** — how often the background sync runs (15/30/60 min).

Outside of "Force sync", the plugin also runs a periodic background sync (only while
online, never prompts to connect) and opportunistically uploads a book's cover the
moment you close it.

## What gets uploaded

⚠️ **Every annotation file under your KOReader home folder.** The scan walks that whole
tree recursively and uploads any `metadata.<ext>.lua` or `*.annotations.lua` it finds —
it isn't limited to books you've opened recently. On a jailbroken Kindle the home folder
is often `/mnt/us`, i.e. the entire storage. Worth knowing before installing on a shared
device.

The reverse also holds: books in folders KOReader doesn't consider "home" are skipped
(the "Force sync" cover backfill is different — it uses `ReadHistory`, which tracks any
file opened regardless of folder).

## Known limitations

If the plugin ever falls unreachable (server down, no route to it), it stays quiet for
15 minutes after the first failed attempt instead of retrying — and blocking the UI —
on every periodic tick or book close. "Force sync" always ignores that cooldown and
tries immediately.
