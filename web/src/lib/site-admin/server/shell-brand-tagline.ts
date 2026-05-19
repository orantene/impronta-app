/**
 * Phase 6B — shared brand-tagline resolver for the modern site shell.
 *
 * Mirrors `resolveShellBrandLogoUrl` / `resolveShellSocialContact`: the
 * `site_header` (and potentially `site_footer`) Component shows the
 * tenant's canonical sub-wordmark line without inventing a parallel
 * store. Source of truth is `agency_business_identity.tagline` — the
 * SAME column the inspector's Brand tab already edits
 * (`patch.patchIdentity({ tagline })`). No new store, no hardcoded copy.
 *
 * Fallback order:
 *   1. section `brand.tagline` — explicit operator override in the shell
 *      editor always wins.
 *   2. `agency_business_identity.tagline` — the canonical identity store
 *      (anon-readable; same column the footer already maps at backfill).
 *   3. `null` → caller renders no tagline line.
 *
 * Cache resilience: narrowly-scoped public read under a distinct key with
 * a short TTL AND the tenant `identity` + `storefront` tags (identity
 * saves bust those instantly; the TTL bounds out-of-band staleness) —
 * identical resilience model to the sibling shell resolvers.
 */

import { unstable_cache } from "next/cache";

import { tagFor } from "@/lib/site-admin/cache-tags";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

/** Short safety-net TTL (seconds). Identity saves still bust the tag
 * instantly; this only bounds staleness for out-of-band writes. */
const SHELL_TAGLINE_TTL_SECONDS = 300;

function loadShellTagline(tenantId: string): Promise<string | null> {
  return unstable_cache(
    async (): Promise<string | null> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return null;
      const { data, error } = await supabase
        .from("agency_business_identity")
        .select("tagline")
        .eq("tenant_id", tenantId)
        .maybeSingle<{ tagline: string | null }>();
      if (error || !data) return null;
      const raw = typeof data.tagline === "string" ? data.tagline.trim() : "";
      return raw.length > 0 ? raw : null;
    },
    ["site-admin:shell-brand-tagline", tenantId],
    {
      revalidate: SHELL_TAGLINE_TTL_SECONDS,
      tags: [tagFor(tenantId, "identity"), tagFor(tenantId, "storefront")],
    },
  )();
}

export async function resolveShellBrandTagline(params: {
  tenantId: string;
  brandTagline?: string | null;
}): Promise<string | null> {
  const explicit = params.brandTagline?.trim();
  if (explicit) return explicit;
  if (!params.tenantId) return null;
  return loadShellTagline(params.tenantId);
}
