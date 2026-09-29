// Script-only stand-in: outside a request there is no user session.
// Prefer the service-role client so hydrate loaders (load-starter-data) can
// read the talent's real profile / photos when applying a Design.
import { createClient as createSb } from "@supabase/supabase-js";

export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createSb(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
