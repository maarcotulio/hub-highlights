import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { resolveDbUser } from "@/lib/currentUser";
import { safeNextPath } from "@/lib/safeRedirect";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(searchParams.get("next"));

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });

    if (!error) {
      const { data } = await supabase.auth.getUser();

      if (data.user) {
        try {
          await resolveDbUser(data.user);
        } catch (err) {
          console.error("Failed to provision User row after sign-in:", err);
          return NextResponse.redirect(
            new URL("/login?error=account_setup_failed", origin)
          );
        }
      }

      return NextResponse.redirect(new URL(next, origin));
    }
  }

  return NextResponse.redirect(new URL("/login?error=link_expired", origin));
}
