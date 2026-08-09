"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import {
  MIN_PASSWORD_LENGTH,
  validatePasswordChoice,
  type AuthFormState,
} from "@/lib/auth/credentials";
import { updatePassword } from "../actions";

export function ResetPasswordForm({ email }: { email: string }) {
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(
    updatePassword,
    {}
  );
  const [clientError, setClientError] = useState<string | null>(null);

  const error = clientError ?? state.error;

  return (
    <div className="w-full max-w-sm">
      <form
        action={formAction}
        onSubmit={(e) => {
          const form = new FormData(e.currentTarget);
          const invalid = validatePasswordChoice(
            String(form.get("password") ?? ""),
            String(form.get("confirmPassword") ?? "")
          );
          setClientError(invalid);
          if (invalid) e.preventDefault();
        }}
        className="flex flex-col gap-7"
      >
        <div className="text-center">
          <div className="text-[28px] font-semibold tracking-tight mb-2">
            Choose a new password
          </div>
          <div className="text-[15px] text-text-2">
            for <strong className="text-text font-medium">{email}</strong>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <TextField
            id="password"
            name="password"
            type="password"
            label={`New password (${MIN_PASSWORD_LENGTH}+ characters)`}
            autoComplete="new-password"
            disabled={isPending}
            invalid={Boolean(error)}
          />
          <TextField
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            label="Confirm new password"
            autoComplete="new-password"
            disabled={isPending}
            invalid={Boolean(error)}
          />
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>

        <Button type="submit" className="w-full text-center" disabled={isPending}>
          {isPending ? "Saving…" : "Save password"}
        </Button>
      </form>
    </div>
  );
}
