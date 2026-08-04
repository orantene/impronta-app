"use server";

/**
 * Decision-3 — editor-only tenant-scoped talent search for the
 * `talent_collection` visual picker.
 *
 * Tenant isolation (defence in depth):
 *   1. `requireSession()` — authenticated workspace staff only (RLS-authed
 *      client), never a public/anon client.
 *   2. `requireTenantScope()` — resolves the active workspace tenant.
 *   3. `listAdminRosterTalentIds(tenantId)` — explicit `agency_talent_roster`
 *      filter on `tenant_id`; results restricted via `.in("id", rosterIds)`.
 *      We do NOT rely on public RLS for tenant scoping.
 *
 * Returns only safe picker fields. No cross-tenant leakage: a profile not on
 * THIS tenant's roster can never appear. Removed-roster talent excluded
 * (listAdminRosterTalentIds filters `status != 'removed'`); soft-deleted
 * profiles excluded. Manual profile-code entry remains as a fallback in the
 * editor; this powers the primary search UX.
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { listAdminRosterTalentIds } from "@/lib/saas/talent-roster";
import { logServerError } from "@/lib/server/safe-error";

export interface TenantTalentPick {
  talentProfileId: string;
  profileCode: string;
  displayName: string;
  primaryTypeLabel: string | null;
  cityLabel: string | null;
  /** First approved public media URL for picker previews and static hero stacks. */
  cardImageUrl: string | null;
}

export type TenantTalentSearchResult =
  | { ok: true; results: TenantTalentPick[] }
  | { ok: false; error: string; code?: string };

type Row = {
  id: string;
  profile_code: string;
  display_name: string | null;
  residence_city:
    | { display_name_i18n: Record<string, string | null> | null }
    | { display_name_i18n: Record<string, string | null> | null }[]
    | null;
  talent_profile_taxonomy:
    | Array<{
        is_primary: boolean | null;
        taxonomy_terms:
          | { name_i18n: Record<string, string | null> | null }
          | { name_i18n: Record<string, string | null> | null }[]
          | null;
      }>
    | null;
};

function one<T>(v: T | T[] | null | undefined): T | null {
  if (Array.isArray(v)) return v[0] ?? null;
  return v ?? null;
}

export async function searchTenantTalent(input: {
  query?: string;
}): Promise<TenantTalentSearchResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "Select an agency workspace first." };
  }

  try {
    const rosterIds = await listAdminRosterTalentIds(
      auth.supabase,
      scope.tenantId,
    );
    if (rosterIds.length === 0) return { ok: true, results: [] };

    let q = auth.supabase
      .from("talent_profiles")
      .select(
        `id, profile_code, display_name,
         residence_city:locations!residence_city_id ( display_name_i18n ),
         talent_profile_taxonomy ( is_primary, taxonomy_terms ( name_i18n ) )`,
      )
      .in("id", rosterIds)
      .is("deleted_at", null)
      .order("display_name", { ascending: true })
      .limit(20);

    // Sanitise for the PostgREST `.or()` grammar + ilike wildcards — strip
    // chars that could break/expand the filter (comma, parens, %, *).
    const raw = (input.query ?? "").trim().slice(0, 60);
    const safe = raw.replace(/[(),%*]/g, " ").trim();
    if (safe.length > 0) {
      q = q.or(
        `display_name.ilike.%${safe}%,profile_code.ilike.%${safe}%`,
      );
    }

    const { data, error } = await q;
    if (error) {
      logServerError("edit-mode/search-tenant-talent", error);
      return { ok: false, error: "Could not search talent." };
    }

    const lowerCity = safe.toLowerCase();
    const baseResults = ((data ?? []) as Row[])
      .map((r) => {
        const city = one(r.residence_city);
        const cityLabel =
          city?.display_name_i18n?.en ?? city?.display_name_i18n?.es ?? null;
        const primary = (r.talent_profile_taxonomy ?? []).find(
          (t) => t.is_primary === true,
        );
        const term = one(primary?.taxonomy_terms ?? null);
        return {
          talentProfileId: r.id,
          profileCode: r.profile_code,
          displayName: r.display_name ?? r.profile_code,
          primaryTypeLabel: term?.name_i18n?.en ?? term?.name_i18n?.es ?? null,
          cityLabel,
        };
      })
      // Best-effort city match in addition to name/code (kept out of the
      // SQL `.or()` to avoid cross-table filter-injection surface).
      .filter(
        (r) =>
          safe.length === 0 ||
          r.displayName.toLowerCase().includes(lowerCity) ||
          r.profileCode.toLowerCase().includes(lowerCity) ||
          (r.cityLabel?.toLowerCase().includes(lowerCity) ?? false),
      );

    const cardImageByProfileId = new Map<string, string>();
    if (baseResults.length > 0) {
      const { data: mediaRows, error: mediaError } = await auth.supabase
        .from("media_assets")
        .select("owner_talent_profile_id, storage_path, variant_kind, sort_order")
        .in(
          "owner_talent_profile_id",
          baseResults.map((r) => r.talentProfileId),
        )
        .eq("approval_state", "approved")
        .is("deleted_at", null)
        .in("variant_kind", ["card", "public_watermarked", "gallery"])
        .order("variant_kind")
        .order("sort_order");

      if (mediaError) {
        logServerError("edit-mode/search-tenant-talent/media", mediaError);
      } else {
        for (const row of mediaRows ?? []) {
          if (
            cardImageByProfileId.has(row.owner_talent_profile_id) ||
            !row.storage_path
          ) {
            continue;
          }
          const { data: urlData } = auth.supabase.storage
            .from("media-public")
            .getPublicUrl(row.storage_path);
          if (urlData?.publicUrl) {
            cardImageByProfileId.set(
              row.owner_talent_profile_id,
              urlData.publicUrl,
            );
          }
        }
      }
    }

    const results: TenantTalentPick[] = baseResults.map((r) => ({
      ...r,
      cardImageUrl: cardImageByProfileId.get(r.talentProfileId) ?? null,
    }));

    return { ok: true, results };
  } catch (error) {
    logServerError("edit-mode/search-tenant-talent", error);
    return { ok: false, error: "Could not search talent." };
  }
}
