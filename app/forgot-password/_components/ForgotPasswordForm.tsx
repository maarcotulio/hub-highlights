"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { validateEmail } from "@/lib/auth/credentials";
import { requestPasswordReset, type ForgotPasswordState } from "../actions";

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState<ForgotPasswordState, FormData>(
    requestPasswordReset,
    {}
  );
  const [clientError, setClientError] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  const error = clientError ?? state.error;

  if (state.sent && !error) {
    return (
      <div className="w-full max-w-sm flex flex-col items-center gap-5 text-center">
        <div className="w-14 h-14 rounded-full bg-surface-2 border border-border flex items-center justify-center text-2xl">
          ✉
        </div>
        <div className="text-xl font-semibold">Check your email</div>
        <div className="text-[15px] text-text-2 leading-relaxed">
          If <strong className="text-text font-medium">{email}</strong> has an account,
          a link to choose a new password is on its way. It expires in an hour.
        </div>
        <Link href="/login" className="text-sm text-accent hover:opacity-80">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <form
        action={formAction}
        onSubmit={(e) => {
          const form = new FormData(e.currentTarget);
          const invalid = validateEmail(String(form.get("email") ?? "").trim());
          setClientError(invalid);
          if (invalid) e.preventDefault();
        }}
        className="flex flex-col gap-7"
      >
        <div className="text-center">
          <div className="text-[28px] font-semibold tracking-tight mb-2">
            Reset your password
          </div>
          <div className="text-[15px] text-text-2">
            We&apos;ll email you a link to choose a new one.
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <TextField
            id="email"
            name="email"
            type="email"
            label="Email"
            placeholder="you@example.com"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
            invalid={Boolean(error)}
          />
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>

        <Button type="submit" className="w-full text-center" disabled={isPending}>
          {isPending ? "Sending…" : "Send reset link"}
        </Button>

        <div className="text-center text-sm text-text-2">
          Remembered it?{" "}
          <Link href="/login" className="text-accent hover:opacity-80">
            Sign in
          </Link>
        </div>
      </form>
    </div>
  );
}
