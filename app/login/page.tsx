"use client";

import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/Button";

type LoginState =
  | { step: "form"; error?: string }
  | { step: "submitting" }
  | { step: "sent"; email: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LoginPage() {
  const [state, setState] = useState<LoginState>({ step: "form" });
  const [email, setEmail] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (state.step !== "form") return;
    if (!EMAIL_RE.test(email)) {
      setState({ step: "form", error: "That doesn't look like a valid email address." });
      return;
    }
    setState({ step: "submitting" });
    await new Promise((r) => setTimeout(r, 600));
    setState({ step: "sent", email });
  }

  return (
    <div className="flex-1 flex items-center justify-center px-6 py-24">
      <div className="w-full max-w-sm">
        {state.step === "form" || state.step === "submitting" ? (
          <form onSubmit={handleSubmit} className="flex flex-col gap-7">
            <div className="text-center">
              <div className="text-[28px] font-semibold tracking-tight mb-2">
                Highlights Hub
              </div>
              <div className="text-[15px] text-text-2">
                Sign in to gather your Kindle and KOReader highlights.
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="email" className="text-sm text-text-2">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                disabled={state.step === "submitting"}
                onChange={(e) => setEmail(e.target.value)}
                className={`text-[15px] px-3.5 py-3 rounded-lg border bg-surface text-text focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-60 ${
                  state.step === "form" && state.error ? "border-danger" : "border-border"
                }`}
              />
              {state.step === "form" && state.error && (
                <span className="text-sm text-danger">{state.error}</span>
              )}
            </div>
            <Button
              type="submit"
              className="w-full text-center"
              disabled={state.step === "submitting"}
            >
              {state.step === "submitting" ? "Sending…" : "Send magic link"}
            </Button>
            <div className="text-center text-sm text-text-2">
              No password needed — we&apos;ll email you a one-time sign-in link.
            </div>
          </form>
        ) : (
          <div className="flex flex-col items-center gap-5 text-center">
            <div className="w-14 h-14 rounded-full bg-surface-2 border border-border flex items-center justify-center text-2xl">
              ✉
            </div>
            <div className="text-xl font-semibold">Check your email</div>
            <div className="text-[15px] text-text-2 leading-relaxed">
              We sent a sign-in link to
              <br />
              <strong className="text-text font-medium">{state.email}</strong>
            </div>
            <Button
              variant="secondary"
              className="mt-1"
              onClick={() => setState({ step: "form" })}
            >
              Use a different email
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
