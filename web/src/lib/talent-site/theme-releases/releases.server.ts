import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import type {
  ReleaseChannel,
  ReleaseItem,
  ReleaseNotes,
  SiteThemeUpdate,
  SiteUpdateState,
  ThemeRelease,
} from "./types";

/**
 * Theme releases data layer. Service-role only (callers pass the admin
 * client). Every function tolerates the tables not existing yet (migration
 * unapplied) and returns an empty/failed result instead of throwing.
 */

export type ReleaseResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Postgres undefined_table / PostgREST schema-cache miss. */
export function isMissingTable(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  return (
    err.code === "42P01" ||
    err.code === "PGRST205" ||
    /does not exist|schema cache/i.test(err.message ?? "")
  );
}

export function clampRolloutPct(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(100, Math.max(0, Math.round(n)));
}

/** Row a draft release is created from (pure, for tests). */
export function buildDraftReleaseRow(input: {
  designSlug: string;
  fromVersion: number;
  toVersion: number;
  items?: ReleaseItem[];
  notes?: ReleaseNotes;
  createdBy?: string | null;
}) {
  return {
    design_slug: input.designSlug,
    from_version: input.fromVersion,
    to_version: input.toVersion,
    channel: "draft" as const,
    status: "draft" as const,
    items: input.items ?? [],
    notes: input.notes ?? {},
    rollout_pct: 0,
    critical: (input.items ?? []).some((i) => i.type === "critical"),
    created_by: input.createdBy ?? null,
  };
}

function fail<T>(scope: string, err: { code?: string; message: string }): ReleaseResult<T> {
  if (!isMissingTable(err)) logServerError(`themeReleases.${scope}`, err);
  return { ok: false, error: err.message };
}

/**
 * Create a DRAFT release unless (design_slug, to_version) already exists.
 * Idempotent: returns `created: false` when the row was already there.
 */
export async function createDraftRelease(
  admin: SupabaseClient,
  input: Parameters<typeof buildDraftReleaseRow>[0],
): Promise<ReleaseResult<{ created: boolean }>> {
  const { data, error } = await admin
    .from("talent_theme_releases")
    .upsert(buildDraftReleaseRow(input) as never, {
      onConflict: "design_slug,to_version",
      ignoreDuplicates: true,
    })
    .select("id");
  if (error) return fail("createDraft", error);
  return { ok: true, value: { created: (data ?? []).length > 0 } };
}

async function patchRelease(
  admin: SupabaseClient,
  id: string,
  patch: Record<string, unknown>,
  scope: string,
): Promise<ReleaseResult<null>> {
  const { error } = await admin
    .from("talent_theme_releases")
    .update({ ...patch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);
  if (error) return fail(scope, error);
  return { ok: true, value: null };
}

export function updateReleaseNotes(
  admin: SupabaseClient,
  id: string,
  patch: { notes?: ReleaseNotes; items?: ReleaseItem[] },
) {
  const set: Record<string, unknown> = {};
  if (patch.notes) set.notes = patch.notes;
  if (patch.items) {
    set.items = patch.items;
    set.critical = patch.items.some((i) => i.type === "critical");
  }
  return patchRelease(admin, id, set, "updateNotes");
}

/** Move a release to a channel; opt-in/default publish it, draft/demos keep it unpublished. */
export function setChannel(admin: SupabaseClient, id: string, channel: ReleaseChannel) {
  const open = channel === "optin" || channel === "default";
  return patchRelease(
    admin,
    id,
    open
      ? { channel, status: "published", published_at: new Date().toISOString() }
      : { channel, status: "draft" },
    "setChannel",
  );
}

export function setRollout(admin: SupabaseClient, id: string, pct: number) {
  return patchRelease(admin, id, { rollout_pct: clampRolloutPct(pct) }, "setRollout");
}

export async function listReleases(
  admin: SupabaseClient,
  designSlug: string,
): Promise<ThemeRelease[]> {
  const { data, error } = await admin
    .from("talent_theme_releases")
    .select("*")
    .eq("design_slug", designSlug)
    .order("to_version", { ascending: false });
  if (error) {
    if (!isMissingTable(error)) logServerError("themeReleases.list", error);
    return [];
  }
  return (data ?? []) as ThemeRelease[];
}

export async function listSiteUpdates(
  admin: SupabaseClient,
  talentSiteId: string,
): Promise<SiteThemeUpdate[]> {
  const { data, error } = await admin
    .from("talent_site_theme_updates")
    .select("*")
    .eq("talent_site_id", talentSiteId)
    .order("created_at", { ascending: false });
  if (error) {
    if (!isMissingTable(error)) logServerError("themeReleases.listSiteUpdates", error);
    return [];
  }
  return (data ?? []) as SiteThemeUpdate[];
}

export async function markSiteUpdate(
  admin: SupabaseClient,
  talentSiteId: string,
  releaseId: string,
  state: SiteUpdateState,
  report?: unknown,
): Promise<ReleaseResult<null>> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("talent_site_theme_updates")
    .update({
      state,
      ...(report !== undefined ? { report } : {}),
      ...(state === "applied" ? { applied_at: now } : {}),
      updated_at: now,
    } as never)
    .eq("talent_site_id", talentSiteId)
    .eq("release_id", releaseId);
  if (error) return fail("markSiteUpdate", error);
  return { ok: true, value: null };
}
