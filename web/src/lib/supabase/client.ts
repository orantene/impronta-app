import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/** Returns `null` when env is missing. */
export function createClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
  return createBrowserClient(url, key);
}
