"use server";

/**
 * Preview-subject search for the Platform Builder Lab (WS5).
 *
 * The Lab is super_admin-only and cross-tenant: an operator picks ANY talent or
 * ANY workspace (agency / hub) across the whole platform to load as the canvas
 * preview subject, then the connected freeform nodes hydrate against that
 * subject (WS4 render plumbing) instead of the platform tenant.
 *
 * This is deliberately SEPARATE from `searchAgencyTalentAction` (which is
 * tenant-roster-scoped for the homepage featured-talent picker). The Lab needs
 * a platform-wide search, so it uses the service-role client behind a
 * `requireSuperAdmin` gate.
 *
 * GATE: every action calls requireSuperAdmin() server-side. Reads go through the
 * service-role client (our gate IS the auth boundary).
 */

import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";

// ── Result types ──────────────────────────────────────────────────────────────

export interface LabTalentSubjectHit {
  /** talent_profiles.id — the previewSubject.id for kind="talent". */
  id: string;
  profileCode: string;
  displayName: string;
  thumbnailUrl: string | null;
  roleLabel: string | null;
}

export interface LabWorkspaceSubjectHit {
  /** agencies.id — the previewSubject.id for kind="workspace". */
  id: string;
  slug: string;
  displayName: string;
  /** "agency" | "hub" — surfaced as a chip in the picker. */
  kind: string;
  planTier: string | null;
}

export type LabSubjectSearchResult<T> =
  | { ok: true; hits: T[]; more: boolean }
  | { ok: false; error: string };

const DEFAULT_LIMIT = 18;
const MAX_LIMIT = 30;

// ── Auth gate ─────────────────────────────────────────────────────────────────

async function requireSuperAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Super admin access required." };
  }
  return { ok: true };
}

function getAdminClient() {
  const client = createServiceRoleClient();
  if (!client) throw new Error("Service-role client unavailable.");
  return client;
}

// ── Talent subject search (cross-tenant) ────────────────────────────────────

interface TalentRow {
  id: string;
  profile_code: string;
  display_name: string | null;
  service_category_slug: string | null;
}

interface MediaRow {
  owner_talent_profile_id: string;
  storage_path: string | null;
  variant_kind: string;
  sort_order: number | null;
}

export async function searchLabTalentSubjects(input: {
  query: string;
  limit?: number;
}): Promise<LabSubjectSearchResult<LabTalentSubjectHit>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const rawQuery = (input.query ?? "").trim();
  const limit = Math.max(1, Math.min(MAX_LIMIT, input.limit ?? DEFAULT_LIMIT));

  try {
    const sb = getAdminClient();
    let query = sb
      .from("talent_profiles")
      .select("id, profile_code, display_name, service_category_slug")
      .is("deleted_at", null)
      .order("display_name", { ascending: true })
      .limit(limit + 1);

    if (rawQuery) {
      const escaped = rawQuery.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(
        `display_name.ilike.%${escaped}%,profile_code.ilike.${escaped}%`,
      ) as typeof query;
    }

    const { data: rows, error } = await query;
    if (error) {
      logServerError("lab/talent-subject-search", error);
      return { ok: false, error: CLIENT_ERROR.generic };
    }

    const matched = (rows ?? []) as TalentRow[];
    const more = matched.length > limit;
    const truncated = more ? matched.slice(0, limit) : matched;

    const ids = truncated.map((r) => r.id);
    const thumbnailMap: Record<string, string> = {};
    if (ids.length > 0) {
      const { data: mediaRows } = await sb
        .from("media_assets")
        .select("owner_talent_profile_id, storage_path, variant_kind, sort_order")
        .in("owner_talent_profile_id", ids)
        .eq("approval_state", "approved")
        .is("deleted_at", null)
        .in("variant_kind", ["card", "public_watermarked", "gallery"])
        .order("variant_kind")
        .order("sort_order");
      for (const row of (mediaRows ?? []) as MediaRow[]) {
        if (thumbnailMap[row.owner_talent_profile_id] || !row.storage_path) continue;
        const { data } = sb.storage.from("media-public").getPublicUrl(row.storage_path);
        if (data?.publicUrl) {
          thumbnailMap[row.owner_talent_profile_id] = data.publicUrl;
        }
      }
    }

    const hits: LabTalentSubjectHit[] = truncated.map((row) => ({
      id: row.id,
      profileCode: row.profile_code,
      displayName: row.display_name?.trim() || `Talent ${row.profile_code}`,
      thumbnailUrl: thumbnailMap[row.id] ?? null,
      roleLabel: row.service_category_slug ? humanizeSlug(row.service_category_slug) : null,
    }));

    return { ok: true, hits, more };
  } catch (err) {
    logServerError("lab/talent-subject-search/unhandled", err);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

// ── Workspace subject search (cross-tenant) ─────────────────────────────────

interface AgencyRow {
  id: string;
  slug: string;
  display_name: string | null;
  kind: string | null;
  plan_tier: string | null;
}

export async function searchLabWorkspaceSubjects(input: {
  query: string;
  limit?: number;
}): Promise<LabSubjectSearchResult<LabWorkspaceSubjectHit>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return { ok: false, error: gate.error };

  const rawQuery = (input.query ?? "").trim();
  const limit = Math.max(1, Math.min(MAX_LIMIT, input.limit ?? DEFAULT_LIMIT));

  try {
    const sb = getAdminClient();
    let query = sb
      .from("agencies")
      .select("id, slug, display_name, kind, plan_tier")
      .eq("status", "active")
      .order("display_name", { ascending: true })
      .limit(limit + 1);

    if (rawQuery) {
      const escaped = rawQuery.replace(/[%_]/g, (m) => `\\${m}`);
      query = query.or(
        `display_name.ilike.%${escaped}%,slug.ilike.%${escaped}%`,
      ) as typeof query;
    }

    const { data: rows, error } = await query;
    if (error) {
      logServerError("lab/workspace-subject-search", error);
      return { ok: false, error: CLIENT_ERROR.generic };
    }

    const matched = (rows ?? []) as AgencyRow[];
    const more = matched.length > limit;
    const truncated = more ? matched.slice(0, limit) : matched;

    const hits: LabWorkspaceSubjectHit[] = truncated.map((row) => ({
      id: row.id,
      slug: row.slug,
      displayName: row.display_name?.trim() || row.slug,
      kind: row.kind ?? "agency",
      planTier: row.plan_tier ?? null,
    }));

    return { ok: true, hits, more };
  } catch (err) {
    logServerError("lab/workspace-subject-search/unhandled", err);
    return { ok: false, error: CLIENT_ERROR.generic };
  }
}

function humanizeSlug(slug: string): string {
  return slug
    .split("-")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
