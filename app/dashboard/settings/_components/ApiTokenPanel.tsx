"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function ApiTokenPanel({
  hasToken,
  webhookUrl,
  lastSyncedLabel,
}: {
  hasToken: boolean;
  webhookUrl: string;
  lastSyncedLabel: string;
}) {
  // Only ever holds a token this page just generated. The server stores a
  // hash, so once this is cleared the value is unrecoverable — which is the
  // point, and why the UI says so before the user navigates away.
  const [token, setToken] = useState<string | null>(null);
  const [tokenExists, setTokenExists] = useState(hasToken);
  const [copied, setCopied] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCopy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleGenerate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/token", { method: "POST" });
      if (!response.ok) {
        setError("Couldn't generate a token. Try again.");
        return;
      }
      const { apiToken } = (await response.json()) as { apiToken: string };
      setToken(apiToken);
      setTokenExists(true);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="border border-border rounded-xl p-6 bg-surface-2 flex flex-col gap-5 max-w-xl">
      <div className="text-sm text-text-2 leading-relaxed">
        Used by the KOReader plugin (<code className="font-mono text-xs">plugins/hub.koplugin</code>)
        to sync automatically. Easiest setup: copy{" "}
        <code className="font-mono text-xs">plugins/hub.koplugin/.env.example</code> to{" "}
        <code className="font-mono text-xs">.env</code> next to the plugin and fill in{" "}
        <code className="font-mono text-xs">SERVER_URL</code>/
        <code className="font-mono text-xs">API_TOKEN</code> below — it&apos;s picked up on
        the next launch. You can also set both from the plugin&apos;s Settings dialog on
        the device instead. Either way it POSTs raw files here with{" "}
        <code className="font-mono text-xs">?filename=metadata.epub.lua</code> and this
        token as a bearer token. To sync right now, use &quot;Force sync&quot; in the
        plugin&apos;s menu on the device.
      </div>

      <div className="text-sm text-text-2 font-mono">{lastSyncedLabel}</div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-mono text-text-2">ENDPOINT</span>
        <div className="font-mono text-sm px-3.5 py-2.5 rounded-lg border border-border bg-surface break-all">
          {webhookUrl}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-mono text-text-2">API TOKEN</span>
        {token ? (
          <>
            <div className="font-mono text-sm px-3.5 py-2.5 rounded-lg border border-border bg-surface break-all">
              {token}
            </div>
            <span className="text-xs text-text-2">
              Copy it now — it&apos;s stored hashed and won&apos;t be shown again.
            </span>
          </>
        ) : (
          <div className="text-sm px-3.5 py-2.5 rounded-lg border border-dashed border-border text-text-2">
            {tokenExists
              ? "A token is active. It can't be displayed again — generate a new one if you've lost it."
              : "No token yet. Generate one to connect the plugin."}
          </div>
        )}
      </div>

      {error && <span className="text-sm text-danger">{error}</span>}

      <div className="flex justify-end gap-3">
        {token && (
          <Button variant="secondary" onClick={handleCopy}>
            {copied ? "Copied" : "Copy token"}
          </Button>
        )}
        <Button variant="secondary" onClick={handleGenerate} disabled={generating}>
          {generating
            ? "Generating…"
            : tokenExists
              ? "Generate new token"
              : "Generate token"}
        </Button>
      </div>

      {tokenExists && (
        <div className="text-xs text-text-2 leading-relaxed">
          Generating a new token immediately revokes the previous one — any device still
          using it will stop syncing until you update it.
        </div>
      )}
    </div>
  );
}
