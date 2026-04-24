"use server";

/**
 * searchAgencyTalentAction — tenant-roster-scoped talent search for the
 * featured_talent bespoke inspector's picker.
 *
 * Query semantics:
 *   - staff-only (requireStaff + tenant scope)
 *   - tenant-roster scoped (admin-side: includes pending/inactive so the
 *     operator sees the same set they manage in /admin/talent — not just
 *     public-visible cards)
 *   - case-insensitive display_name ILIKE '%query%' match
 *   - optional profileCode prefix match so operators can paste codes too
 *   - optional excludeCodes so the picker can hide already-selected talent
 *
 * Hot-path notes:
 *   - ILIKE '%q%' on talent_profiles.display_name is fine up to ~20k rows
 *     per tenant; beyond that we'd want a trigram index. A separate migration
 *     (`display_name_trgm_idx`) tracks that — this action is index-ready.
 *   - Thumbnail hydration mirrors the storefront's hydrateRows logic so
 *     picker thumbs match the card thumbs operators will see at publish.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { listAdminRosterTalentIds } from "@/lib/saas/talent-roster";

export interface TalentSearchHit {
  id: string;
  profileCode: string;
  displayName: string;
  thumbnailUrl: string | null;
  roleLabel: string | null;
  locationLabel: string | null;
}

export interface TalentSearchResult {
  ok: true;
  hits: TalentSearchHit[];
  more: boolean;
}
export interface TalentSearchError {
  ok: false;
  error: string;
  code?: string;
}

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 30;

interface TalentRow {
  id: string;
  profile_code: string;
  display_name: string | null;
  service_category_slug: string | null;
  residence_city_id: string | null;
}

interface MediaRow {
  owner_talent_profile_id: string;
  storage_path: string | null;
  variant_kind: string;
  sort_order: number | null;
}

export async function searchAgencyTalentAction(input: {
  query: string;
  limit?: number;
  excludeCodes?: string[];
}): Promise<TalentSearchResult | TalentSearchError> {
  const auth = await requireStaff();
  if (!auth.ok) {
    return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  }
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "Tenant scope required", code: "TENANT_SCOPE" };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      ok: false,
      error: "Server is missing service-role credentials.",
      code: "CONFIG",
    };
  }

  const rawQuery = (input.query ?? "").trim();
  const limit = Math.max(1, Math.min(MAX_LIMIT, input.limit ?? DEFAULT_LIMIT));
  const excludeCodes = (input.excludeCodes ?? [])
    .map((c) => c.trim())
    .filter(Boolean);

  try {
    const rosterIds = await listAdminRosterTalentIds(admin, scope.tenantId);
    if (rosterIds.length === 0) {
      return { ok: true, hits: [], more: false };
    }

    let query = admin
      .from("talent_profiles")
      .select("id, profile_code, display_name, service_category_slug, residence_city_id")
      .in("id", rosterIds)
      .is("deleted_at", null)
      .order("display_name", { ascending: true })
      // Fetch one extra so we can report `more` without a count() query.
      .limit(limit + 1);

    if (rawQuery) {
      // ILIKE on display_name with optional profile_code prefix fallback.
      // The `.or()` lets operators paste a code and still find the person.
      const escaped = rawQuery.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(
        `display_name.ilike.%${escaped}%,profile_code.ilike.${escaped}%`,
      );
    }

    if (excludeCodes.length > 0) {
      query = query.not(
        "profile_code",
        "in",
        `(${excludeCodes.map((c) => `"${c.replace(/"/g, "")}"`).join(",")})`,
      );
    }

    const { data: rows, error } = await query;
    if (error) {
      logServerError("edit-mode/talent-search", error);
      return { ok: false, error: "Search failed", code: "QUERY" };
    }

    const matched = (rows ?? []) as TalentRow[];
    const more = matched.length > limit;
    const truncated = more ? matched.slice(0, limit) : matched;

    // Thumbnail hydration — mirrors the storefront hydrateRows to keep the
    // picker's visual source-of-truth aligned with what ships at publish.
    const ids = truncated.map((r) => r.id);
    const thumbnailMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: mediaRows } = await admin
        .from("media_assets")
        .select("owner_talent_profile_id, storage_path, variant_kind, sort_order")
        .in("owner_talent_profile_id", ids)
        .eq("approval_state", "approved")
        .is("deleted_at", null)
        .in("variant_kind", ["card", "public_watermarked", "gallery"])
        .order("variant_kind")
        .order("sort_order");
      for (const row of (mediaRows ?? []) as MediaRow[]) {
        if (
          thumbnailMap[row.owner_talent_profile_id] ||
          !row.storage_path
        ) {
          continue;
        }
        const { data } = admin.storage.from("media-public").getPublicUrl(row.storage_path);
        if (data?.publicUrl) {
          thumbnailMap[row.owner_talent_profile_id] = data.publicUrl;
        }
      }
    }

    const hits: TalentSearchHit[] = truncated.map((row) => ({
      id: row.id,
      profileCode: row.profile_code,
      displayName: row.display_name?.trim() || `Talent ${row.profile_code}`,
      thumbnailUrl: thumbnailMap[row.id] ?? null,
      roleLabel: row.service_category_slug
        ? humanizeSlug(row.service_category_slug)
        : null,
      locationLabel: null,
    }));

    return { ok: true, hits, more };
  } catch (err) {
    logServerError("edit-mode/talent-search/unhandled", err);
    return { ok: false, error: "Search failed", code: "UNHANDLED" };
  }
}

/**
 * Resolve display data for an existing list of profile_codes — used by the
 * featured_talent panel to render the currently-picked talent as rich cards
 * instead of raw codes. Shape matches `TalentSearchHit` so the same row
 * component can render both search results and selected items.
 */
export async function resolveTalentByCodesAction(input: {
  codes: string[];
}): Promise<TalentSearchResult | TalentSearchError> {
  const auth = await requireStaff();
  if (!auth.ok) {
    return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  }
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "Tenant scope required", code: "TENANT_SCOPE" };
  }

  const codes = (input.codes ?? []).map((c) => c.trim()).filter(Boolean);
  if (codes.length === 0) return { ok: true, hits: [], more: false };

  const admin = createServiceRoleClient();
  if (!admin) {
    return {
      ok: false,
      error: "Server is missing service-role credentials.",
      code: "CONFIG",
    };
  }

  try {
    const rosterIds = await listAdminRosterTalentIds(admin, scope.tenantId);
    if (rosterIds.length === 0) return { ok: true, hits: [], more: false };

    const { data: rows, error } = await admin
      .from("talent_profiles")
      .select("id, profile_code, display_name, service_category_slug, residence_city_id")
      .in("id", rosterIds)
      .in("profile_code", codes)
      .is("deleted_at", null);
    if (error) {
      logServerError("edit-mode/talent-resolve", error);
      return { ok: false, error: "Resolve failed", code: "QUERY" };
    }

    const found = ((rows ?? []) as TalentRow[]).reduce<Record<string, TalentRow>>(
      (acc, row) => {
        acc[row.profile_code] = row;
        return acc;
      },
      {},
    );

    // Preserve the caller's order and silently drop codes that don't belong
    // to this tenant (roster may have changed since the section was saved).
    const orderedRows = codes.map((c) => found[c]).filter((r): r is TalentRow => Boolean(r));

    // Thumbnail hydration (same as search).
    const ids = orderedRows.map((r) => r.id);
    const thumbnailMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: mediaRows } = await admin
        .from("media_assets")
        .select("owner_talent_profile_id, storage_path, variant_kind, sort_order")
        .in("owner_talent_profile_id", ids)
        .eq("approval_state", "approved")
        .is("deleted_at", null)
        .in("variant_kind", ["card", "public_watermarked", "gallery"])
        .order("variant_kind")
        .order("sort_order");
      for (const row of (mediaRows ?? []) as MediaRow[]) {
        if (
          thumbnailMap[row.owner_talent_profile_id] ||
          !row.storage_path
        ) {
          continue;
        }
        const { data } = admin.storage.from("media-public").getPublicUrl(row.storage_path);
        if (data?.publicUrl) {
          thumbnailMap[row.owner_talent_profile_id] = data.publicUrl;
        }
      }
    }

    const hits: TalentSearchHit[] = orderedRows.map((row) => ({
      id: row.id,
      profileCode: row.profile_code,
      displayName: row.display_name?.trim() || `Talent ${row.profile_code}`,
      thumbnailUrl: thumbnailMap[row.id] ?? null,
      roleLabel: row.service_category_slug
        ? humanizeSlug(row.service_category_slug)
        : null,
      locationLabel: null,
    }));

    return { ok: true, hits, more: false };
  } catch (err) {
    logServerError("edit-mode/talent-resolve/unhandled", err);
    return { ok: false, error: "Resolve failed", code: "UNHANDLED" };
  }
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
