"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();

  // Default scope is "global": every refresh token for this user is revoked,
  // not just this browser's. A sign-out that leaves other sessions alive isn't
  // much of a sign-out when the reason for it is a shared or lost machine.
  const { error } = await supabase.auth.signOut();
  if (error) {
    // The cookies are cleared locally either way, so the user is signed out of
    // this browser regardless; only the server-side revocation is in doubt.
    console.error("Sign-out failed to revoke the session server-side:", error);
  }

  revalidatePath("/", "layout");
  redirect("/login");
}
