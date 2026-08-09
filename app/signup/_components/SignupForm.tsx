"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import {
  MIN_PASSWORD_LENGTH,
  validateSignUp,
  type AuthFormState,
} from "@/lib/auth/credentials";
import { signUp } from "../actions";

export function SignupForm({ next }: { next: string }) {
  const [state, formAction, isPending] = useActionState<AuthFormState, FormData>(
    signUp,
    {}
  );
  // Mirrors the server-side check so an obviously incomplete form doesn't cost
  // a round trip. `signUp` re-validates regardless — this is only ergonomics.
  const [clientError, setClientError] = useState<string | null>(null);
  // Controlled on purpose: React resets a form's uncontrolled fields once its
  // action settles, which would clear the email on every failed attempt. The
  // password fields are left uncontrolled so they *do* get cleared.
  const [email, setEmail] = useState("");

  const error = clientError ?? state.error;
  const signInHref = next === "/dashboard" ? "/login" : `/login?next=${encodeURIComponent(next)}`;

  return (
    <div className="w-full max-w-sm">
      <form
        action={formAction}
        onSubmit={(e) => {
          const form = new FormData(e.currentTarget);
          const invalid = validateSignUp(
            String(form.get("email") ?? "").trim(),
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
            Create your account
          </div>
          <div className="text-[15px] text-text-2">
            One home for every KOReader highlight.
          </div>
        </div>

        <input type="hidden" name="next" value={next} />

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
          <TextField
            id="password"
            name="password"
            type="password"
            label={`Password (${MIN_PASSWORD_LENGTH}+ characters)`}
            autoComplete="new-password"
            disabled={isPending}
            invalid={Boolean(error)}
          />
          <TextField
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            label="Confirm password"
            autoComplete="new-password"
            disabled={isPending}
            invalid={Boolean(error)}
          />
          {error && <span className="text-sm text-danger">{error}</span>}
        </div>

        <Button type="submit" className="w-full text-center" disabled={isPending}>
          {isPending ? "Creating account…" : "Create account"}
        </Button>

        <div className="text-center text-sm text-text-2">
          Already have an account?{" "}
          <Link href={signInHref} className="text-accent hover:opacity-80">
            Sign in
          </Link>
        </div>
      </form>
    </div>
  );
}
