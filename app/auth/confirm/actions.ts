"use server";

import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { resolveDbUser } from "@/lib/currentUser";

export async function confirmSignIn(tokenHash: string, type: EmailOtpType, next: string) {
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    redirect("/login?error=link_expired");
  }

  const { data } = await supabase.auth.getUser();

  if (data.user) {
    try {
      await resolveDbUser(data.user);
    } catch (err) {
      console.error("Failed to provision User row after sign-in:", err);
      redirect("/login?error=account_setup_failed");
    }
  }

  redirect(next);
}
