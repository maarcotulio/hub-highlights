"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function ApiTokenPanel({ token: initialToken, webhookUrl }: { token: string; webhookUrl: string }) {
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
        For automated uploads from outside the browser — e.g. a future
        KOReader-side integration. POST the raw file to this URL with{" "}
        <code className="font-mono text-xs">?filename=metadata.epub.lua</code> and
        the token below as a bearer token. Nothing calls this yet.
      </div>

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
