"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function ApiTokenPanel({
  token: initialToken,
  webhookUrl,
  lastSyncedLabel,
}: {
  token: string;
  webhookUrl: string;
  lastSyncedLabel: string;
}) {
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    const response = await fetch("/api/settings/token", { method: "POST" });
    if (response.ok) {
      const { apiToken } = (await response.json()) as { apiToken: string };
      setToken(apiToken);
    }
    setRegenerating(false);
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
        <div className="font-mono text-sm px-3.5 py-2.5 rounded-lg border border-border bg-surface break-all">
          {token}
        </div>
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={handleCopy}>
          {copied ? "Copied" : "Copy token"}
        </Button>
        <Button variant="ghost" onClick={handleRegenerate} disabled={regenerating}>
          {regenerating ? "Regenerating…" : "Regenerate"}
        </Button>
      </div>
    </div>
  );
}
