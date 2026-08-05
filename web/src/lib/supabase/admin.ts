import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * Service-role client for trusted server-only operations (e.g. admin password reset).
 * Returns null when the key is not configured.
 */
export function createServiceRoleClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

/**
 * Service-role client whose reads are NEVER served from Next's per-render
 * request memoization.
 *
 * WHY THIS EXISTS — the first-run storefront seed (2026-08-05).
 *
 * Next memoizes identical `fetch` GETs for the lifetime of ONE render pass.
 * supabase-js issues every PostgREST read through that patched `fetch`, so two
 * reads with the same URL inside one render return the SAME response object —
 * including a response captured BEFORE an intervening INSERT.
 *
 * The workspace-provisioning trampoline (`/onboarding/workspace` →
 * `provisionWorkspaceFromLead` → `onboardStarterContent`) runs entirely inside
 * a Server Component render (see `render-safe-cache.ts`, which exists for the
 * same reason). Its homepage reads all share one canonical URL:
 *
 *     cms_pages?tenant_id=eq.…&locale=eq.en&is_system_owned=eq.true
 *              &system_template_key=eq.homepage
 *
 * `ensureHomepageRow` probes that URL first (row absent → empty result, now
 * memoized), then INSERTs. Every later read of the same URL in that render —
 * the seeder's, `saveHomepageDraftComposition`'s CAS read,
 * `publishHomepage`'s CAS read — was served the stale memoized body. That is
 * the whole bug: the seed bailed with HOME_NOT_FOUND / NOT_FOUND, and on a
 * later retry (where the memoized body was the pre-save v1 row) the publish
 * CAS failed with VERSION_CONFLICT. Both symptoms, one cause.
 *
 * Three independent opt-outs are applied because each targets a different
 * layer, and the read-after-write correctness of provisioning must not rest on
 * one framework internal:
 *   1. a fresh `AbortController` signal   — React/Next skip memoizing signalled requests
 *   2. `cache: "no-store"`                — never serve or populate the Data Cache
 *   3. a unique per-request header        — makes the memo cache key unique regardless
 *
 * Use this ONLY for read-after-write flows that run during render. Everywhere
 * else `createServiceRoleClient` is correct and cheaper (memoized reads dedupe).
 */
export function createUncachedServiceRoleClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        headers.set(
          "x-tulala-read-after-write",
          `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
        );
        return fetch(input, {
          ...init,
          headers,
          cache: "no-store",
          signal: init?.signal ?? new AbortController().signal,
        });
      },
    },
  });
}
