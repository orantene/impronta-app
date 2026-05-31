import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies, headers } from "next/headers";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cookieDomainForHost, isSupabaseAuthCookie } from "@/lib/supabase/cookie-domain";

/** Returns `null` when env is missing — callers should handle (UI + actions). */
export async function createClient(): Promise<SupabaseClient | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();

  // Scope auth cookies to the shared parent domain (e.g. ".tulala.digital") so
  // a session created on the marketing host carries to the app host. Resolved
  // once per request from the host header; `undefined` for hosts we don't share
  // across (localhost, custom domains) → cookies stay host-only as before.
  let authCookieDomain: string | undefined;
  try {
    const hdrs = await headers();
    authCookieDomain = cookieDomainForHost(
      hdrs.get("x-impronta-host-name") ?? hdrs.get("host"),
    );
  } catch {
    authCookieDomain = undefined;
  }

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, {
              ...options,
              ...(authCookieDomain && isSupabaseAuthCookie(name)
                ? { domain: authCookieDomain }
                : {}),
            }),
          );
        } catch {
          /* ignore when called from Server Component */
        }
      },
    },
  });
}
