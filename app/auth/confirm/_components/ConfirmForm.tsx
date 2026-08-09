"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function ConfirmForm({ action }: { action: () => Promise<void> }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    await action();
  }

  return (
    <div className="w-full max-w-sm flex flex-col gap-7">
      <div className="text-center">
        <div className="text-[28px] font-semibold tracking-tight mb-2">
          Highlights Hub
        </div>
        <div className="text-[15px] text-text-2">
          Click below to finish signing in.
        </div>
      </div>
      <Button
        type="button"
        className="w-full text-center"
        disabled={pending}
        onClick={handleClick}
      >
        {pending ? "Signing in…" : "Confirm sign-in"}
      </Button>
    </div>
  );
}
