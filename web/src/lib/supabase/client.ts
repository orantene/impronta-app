import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { cookieDomainForHost } from "@/lib/supabase/cookie-domain";

/** Returns `null` when env is missing. */
export function createClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) {
    return null;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();

  // Match the server's cross-subdomain cookie scoping so client-set auth
  // cookies — notably the PKCE `code-verifier` written when starting Google
  // OAuth from the marketing-host modal — are readable by the app-host
  // `/auth/callback` that completes the exchange. `undefined` (localhost,
  // custom domains) keeps the prior host-only behaviour.
  const domain =
    typeof window !== "undefined"
      ? cookieDomainForHost(window.location.hostname)
      : undefined;

  return createBrowserClient(
    url,
    key,
    domain ? { cookieOptions: { domain } } : undefined,
  );
}
