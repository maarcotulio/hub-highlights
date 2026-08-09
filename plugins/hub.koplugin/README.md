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

## Where to find it

**Settings (gear icon) → Network → Highlights Hub**. Inside:

- **Force sync** — uploads changed files right away, plus backfills covers for every
  book read this calendar month.
- **Settings…** — server URL / API token.
- **Sync interval** — how often the background sync runs (15/30/60 min).

Outside of "Force sync", the plugin also runs a periodic background sync (only while
online, never prompts to connect) and opportunistically uploads a book's cover the
moment you close it.

## Known limitations

⚠️ **Only finds files inside the configured KOReader home folder.** If your books are
scattered in folders KOReader doesn't consider "home", they're skipped by this scan
(the "Force sync" cover backfill is different — it uses `ReadHistory`, which tracks any
file opened regardless of folder).

If the plugin ever falls unreachable (server down, no route to it), it stays quiet for
15 minutes after the first failed attempt instead of retrying — and blocking the UI —
on every periodic tick or book close. "Force sync" always ignores that cooldown and
tries immediately.
