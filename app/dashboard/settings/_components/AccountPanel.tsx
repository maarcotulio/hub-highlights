"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { signOut } from "@/app/auth/actions";

export function AccountPanel({ email }: { email: string }) {
  const [isPending, startTransition] = useTransition();

  return (
    <div className="border border-border rounded-xl p-6 bg-surface-2 flex flex-col gap-5 max-w-xl">
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-mono text-text-2">SIGNED IN AS</span>
        <div className="font-mono text-sm px-3.5 py-2.5 rounded-lg border border-border bg-surface break-all">
          {email}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          disabled={isPending}
          onClick={() => startTransition(() => signOut())}
        >
          {isPending ? "Signing out…" : "Sign out"}
        </Button>
        <span className="text-xs text-text-2">
          Signs you out everywhere, on every device.
        </span>
      </div>
    </div>
  );
}
