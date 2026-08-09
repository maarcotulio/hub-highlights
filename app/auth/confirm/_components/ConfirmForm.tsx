"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

export function ConfirmForm({ action }: { action: () => Promise<void> }) {
  const [pending, setPending] = useState(false);

  return (
    <div className="w-full max-w-sm flex flex-col gap-7">
      <div className="text-center">
        <div className="text-[28px] font-semibold tracking-tight mb-2">
          Highlights Hub
        </div>
        <div className="text-[15px] text-text-2">
          Confirm below to choose a new password.
        </div>
      </div>
      <Button
        type="button"
        className="w-full text-center"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          await action();
        }}
      >
        {pending ? "Confirming…" : "Confirm password reset"}
      </Button>
    </div>
  );
}
