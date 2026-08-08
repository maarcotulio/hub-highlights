import "server-only";
import { createClient } from "@supabase/supabase-js";

// Service-role client for server-side Storage writes (bucket uploads bypass
// RLS). Never import this from client components — SUPABASE_SECRET_KEY must
// stay server-only.
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
