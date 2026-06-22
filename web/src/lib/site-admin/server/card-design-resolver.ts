/**
 * Per-tenant card-design resolver (P3).
 *
 * The storefront paints a tenant's card palette through the global `<html>`
 * token cascade (`designTokensToCssVars` on the storefront root). But two
 * surfaces escape that cascade and need each card to carry its OWN agency's
 * `--token-card-*` vars inline:
 *
 *   1. The marketing global directory — CROSS-TENANT. One page renders rows
 *      from many agencies, so no single `<html>` token scope is right for
 *      every row. The page resolves a `CardDesign` PER distinct
 *      `agencyTenantId` and spreads it on each row's card root.
 *   2. The client dashboard shells — talent from many agencies under the
 *      neutral platform shell.
 *
 * This module is the ONLY path from a tenant's live `theme_json` card subset
 * to those surfaces. It reads `agency_branding.theme_json` (the LIVE map,
 * never the draft), projects the card subset via the pure `projectCardDesign`
 * (`card-design-shape.ts`), and caches the result per tenant under the
 * `branding` + `card-design` tags so a publish busts it instantly.
 *
 * `server-only`: the Supabase service/public client + `unstable_cache` must
 * never reach the client bundle. Client components import the `CardDesign`
 * TYPE from `card-design-shape.ts` (framework-free), never from here.
 */

import "server-only";

import { unstable_cache } from "next/cache";

import { tagFor } from "@/lib/site-admin/cache-tags";
import { createPublicSupabaseClient } from "@/lib/supabase/public";

import {
  DEFAULT_CARD_DESIGN,
  projectCardDesign,
  type CardDesign,
} from "./card-design-shape";

// Re-export the type from its framework-free home so callers can do a single
// `import { resolveCardDesign, type CardDesign }` from the resolver.
export type { CardDesign } from "./card-design-shape";

/**
 * Safety-net TTL (seconds). `publishDesign` busts `tagFor(tenantId,
 * "card-design")` (and `"branding"`) instantly; this only bounds staleness
 * for out-of-band writes. Mirrors the sibling shell resolvers' 300s.
 */
const CARD_DESIGN_TTL_SECONDS = 300;

type BrandingThemeRow = { theme_json: Record<string, unknown> | null };

function loadCardDesign(tenantId: string): Promise<CardDesign> {
  return unstable_cache(
    async (): Promise<CardDesign> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return DEFAULT_CARD_DESIGN;
      const { data, error } = await supabase
        .from("agency_branding")
        .select("theme_json")
        .eq("tenant_id", tenantId)
        .maybeSingle<BrandingThemeRow>();
      if (error || !data) return DEFAULT_CARD_DESIGN;
      return projectCardDesign(data.theme_json);
    },
    ["site-admin:card-design", tenantId],
    {
      revalidate: CARD_DESIGN_TTL_SECONDS,
      tags: [
        tagFor(tenantId, "branding"),
        tagFor(tenantId, "card-design"),
      ],
    },
  )();
}

/**
 * Resolve the live `CardDesign` for one tenant. Returns the platform default
 * (`classic`, no color pins) when the tenant id is empty, Supabase env is
 * missing, the row is absent, or the read errors — so callers never need a
 * null branch. Cached per tenant; safe to call once per distinct
 * `agencyTenantId` on a cross-tenant page (memoize per tenant at the call
 * site to dedupe within a single render).
 */
export async function resolveCardDesign(
  tenantId: string,
): Promise<CardDesign> {
  if (!tenantId || typeof tenantId !== "string") return DEFAULT_CARD_DESIGN;
  return loadCardDesign(tenantId);
}
