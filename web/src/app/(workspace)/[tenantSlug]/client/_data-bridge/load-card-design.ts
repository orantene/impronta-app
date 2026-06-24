import "server-only";

/**
 * Client-dashboard card-design bridge (P3).
 *
 * The client dashboard (Discover / Favorites / Shortlists) renders talent
 * from many agencies under the NEUTRAL platform shell — it never sits inside
 * a single tenant's `<html>` token cascade, so the cards can't inherit a
 * `--token-card-*` palette the way the storefront does. This bridge is the
 * server-side seam that pulls a `CardDesign` out of the live `theme_json` for
 * the relevant tenant(s) and hands it to the shell, which spreads it as inline
 * `--token-card-*` vars on each `<TalentCard>` root via `cardDesignToCssVars`.
 *
 * `server-only`: it calls `resolveCardDesign` (Supabase + `unstable_cache`),
 * which must never reach the client bundle. The shell receives the projected
 * `CardDesign` (or the inline css-var map) as a plain serializable prop — the
 * client component imports the `CardDesign` TYPE from the framework-free
 * `card-design-shape.ts`, never this module.
 */

import {
  resolveCardDesign,
  type CardDesign,
} from "@/lib/site-admin/server/card-design-resolver";

/**
 * Resolve the card design for the client dashboard's own tenant scope. This is
 * the shell-level palette the Discover grid paints onto every card by default
 * (the surface is browse-only; one consistent palette keeps the cross-tenant
 * grid quiet). Returns the platform default on an empty id / read error, so the
 * caller never needs a null branch.
 */
export function loadClientCardDesign(tenantId: string): Promise<CardDesign> {
  return resolveCardDesign(tenantId);
}

/**
 * Resolve one `CardDesign` per DISTINCT owning-agency tenant across a set of
 * rows, so a cross-tenant list (Favorites / Shortlists) can paint each card in
 * its OWN agency's palette rather than the shell tenant's. Mirrors the
 * marketing directory's `resolveCardDesignsForRows`: independents (null
 * `agencyTenantId`) are skipped, and each distinct tenant is resolved exactly
 * once (the resolver is itself per-tenant cached). Returns an
 * `agencyTenantId → CardDesign` map the shell looks each row up in; a row whose
 * tenant is absent falls back to the theme cascade (no inline vars).
 */
export async function loadCardDesignsByTenant(
  agencyTenantIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, CardDesign>> {
  const distinct = Array.from(
    new Set(
      agencyTenantIds.filter(
        (id): id is string => typeof id === "string" && id.length > 0,
      ),
    ),
  );
  const entries = await Promise.all(
    distinct.map(async (id) => [id, await resolveCardDesign(id)] as const),
  );
  return new Map(entries);
}
