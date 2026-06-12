"use server";

/**
 * Talent-scoped theme (design) actions — the talent-page analogue of the
 * tenant-scoped `design-actions.ts`.
 *
 * The ThemeDrawer needs the same three lifecycle moves (load / save draft /
 * publish) plus preset-apply + component-style-defaults-save, but for a TALENT
 * page instead of the agency storefront. The tenant-scoped actions resolve a
 * `requireTenantScope()` and read/write `agency_branding`; a signed-in talent
 * has no such tenant scope, so those 401 ("Not authorized").
 *
 * These actions instead:
 *   - resolve the SIGNED-IN talent's own `talent_profiles.id` (cookie session),
 *   - read/write `talent_pages.theme.__design` for that talent's page,
 *   - rely on the `talent_pages_owner` RLS policy (talent may write only their
 *     own row) — NO new column, NO migration.
 *
 * The design slice lives under a reserved `__design` key on the SAME jsonb the
 * page-content adapter uses for style classes; the read-modify-write here
 * preserves those style-class entries (see `talent-design-store.ts`). The CSS
 * tokens themselves are validated against the SAME registry as the agency theme
 * (`validateThemePatch`) so the same projection / cascade consumes them.
 *
 * Result shapes are STRUCTURALLY COMPATIBLE with `design-actions.ts`
 * (`DesignLoadResult` / `DesignSaveResult` / `DesignPresetResult` /
 * `DesignPublishResult` / `ComponentStylesSaveResult`) so the surface-aware
 * drawer can call either action set behind one interface.
 */

import {
  normalizeComponentStyleDefaults,
  type ComponentStyleDefaults,
} from "@/lib/site-admin/builder-node/component-style-defaults";
import { tokenDefaults, validateThemePatch } from "@/lib/site-admin/tokens/registry";
import { getThemePreset } from "@/lib/site-admin/presets/theme-presets";
import { getCachedActorSession, getCachedServerSupabase } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";
import type {
  DesignLoadResult,
  DesignPresetResult,
  DesignPublishResult,
  DesignSaveResult,
  ComponentStylesSaveResult,
} from "./design-actions";
import {
  readTalentDesignSlice,
  writeTalentDesignSlice,
  type TalentDesignSlice,
} from "./talent-design-store";

// ── helpers ─────────────────────────────────────────────────────────────────

/** The minimal `talent_pages` row these actions read/write. */
const ROW_COLS = "id, talent_profile_id, slug, theme" as const;

interface ThemeRow {
  id: string;
  talent_profile_id: string;
  slug: string;
  theme: unknown;
}

/**
 * Merge platform defaults under the talent's stored token map so the drawer
 * always has a value to render for every control (same contract as the agency
 * `withDefaults`). Non-string values are ignored.
 */
function withDefaults(raw: Record<string, unknown> | null | undefined): Record<string, string> {
  const out: Record<string, string> = { ...tokenDefaults() };
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.length > 0) out[key] = value;
  }
  return out;
}

/**
 * Resolve (signed-in talent profile id, supabase) and load the talent_pages row
 * for `slug`. The cookie-session client makes `talent_pages_owner` RLS apply, so
 * a talent can only ever read/write their OWN row. Returns a typed error result
 * (compatible with the design actions) on any failure.
 */
async function resolveOwnTalentPageRow(
  slug: string,
):
  | Promise<
      | { ok: true; supabase: NonNullable<Awaited<ReturnType<typeof getCachedServerSupabase>>>; row: ThemeRow }
      | { ok: false; error: string; code?: string }
    > {
  const session = await getCachedActorSession();
  if (!session.supabase || !session.user) {
    return { ok: false, error: "Please sign in again.", code: "UNAUTHORIZED" };
  }
  const supabase = session.supabase;

  // The signed-in user's own talent profile id. Owner-RLS on talent_pages keys
  // off this; we also use it to target the right row explicitly.
  const { data: profile, error: profileErr } = await supabase
    .from("talent_profiles")
    .select("id")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (profileErr || !profile) {
    return { ok: false, error: "No talent profile for this account.", code: "NOT_FOUND" };
  }
  const talentProfileId = (profile as { id: string }).id;

  const { data, error } = await supabase
    .from("talent_pages")
    .select(ROW_COLS)
    .eq("talent_profile_id", talentProfileId)
    .eq("slug", slug)
    .maybeSingle();
  if (error) {
    logServerError("talent-design/load-row", error);
    return { ok: false, error: "Could not load your page." };
  }
  if (!data) {
    return {
      ok: false,
      error: "Open your page in the builder before editing its theme.",
      code: "NOT_FOUND",
    };
  }
  return { ok: true, supabase, row: data as ThemeRow };
}

/**
 * Persist a new design slice onto the row (read-modify-write, preserving style
 * classes). Bumps `talent_pages.updated_at`. Owner-RLS gates the write.
 */
async function persistDesignSlice(
  supabase: NonNullable<Awaited<ReturnType<typeof getCachedServerSupabase>>>,
  row: ThemeRow,
  slice: TalentDesignSlice,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const nextTheme = writeTalentDesignSlice(row.theme, slice);
  const { error } = await supabase
    .from("talent_pages")
    .update({ theme: nextTheme, updated_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("talent_profile_id", row.talent_profile_id);
  if (error) {
    logServerError("talent-design/persist", error);
    return { ok: false, error: "Could not save your theme." };
  }
  return { ok: true };
}

function snapshotFromSlice(slice: TalentDesignSlice): DesignLoadResult {
  return {
    ok: true,
    snapshot: {
      themeDraft: withDefaults(slice.tokensDraft),
      themeLive: withDefaults(slice.tokens),
      presetSlug: slice.presetSlug,
      themePublishedAt: slice.publishedAt,
      version: slice.version,
      componentStylesDraft: normalizeComponentStyleDefaults(slice.componentStylesDraft),
      componentStylesLive: normalizeComponentStyleDefaults(slice.componentStyles),
    },
  };
}

// ── load ──────────────────────────────────────────────────────────────────

/**
 * Single read the ThemeDrawer makes on open for a talent page. Returns the same
 * `DesignSnapshot` shape as `loadDesignAction`, sourced from
 * `talent_pages.theme.__design` (defaults under the talent's overrides).
 */
export async function loadTalentDesignAction(input: {
  pageSlug: string;
}): Promise<DesignLoadResult> {
  const resolved = await resolveOwnTalentPageRow(input.pageSlug);
  if (!resolved.ok) return { ok: false, error: resolved.error, code: resolved.code };
  try {
    const slice = readTalentDesignSlice(resolved.row.theme);
    return snapshotFromSlice(slice);
  } catch (error) {
    logServerError("talent-design/load", error);
    return { ok: false, error: "Failed to load theme." };
  }
}

// ── save draft ──────────────────────────────────────────────────────────────

/**
 * Replace `__design.tokensDraft` with the validated patch and bump the slice
 * version. No public effect (draft). Tokens are validated against the SAME
 * registry as the agency theme; unknown / non-configurable / invalid keys are
 * dropped (the UI submits the full working copy, so a missing key means "fall
 * back to the platform default").
 */
export async function saveTalentDesignDraftAction(input: {
  pageSlug: string;
  patch: Record<string, string>;
  expectedVersion: number;
}): Promise<DesignSaveResult> {
  const resolved = await resolveOwnTalentPageRow(input.pageSlug);
  if (!resolved.ok) return { ok: false, error: resolved.error, code: resolved.code };

  const current = readTalentDesignSlice(resolved.row.theme);
  if (current.version !== input.expectedVersion) {
    return {
      ok: false,
      error: "Theme changed elsewhere; reload and try again.",
      code: "VERSION_CONFLICT",
      currentVersion: current.version,
    };
  }

  // Drop empty strings (clearing a field), then validate against the registry.
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.patch)) {
    if (typeof value === "string" && value.length > 0) cleaned[key] = value;
  }
  const validated = validateThemePatch(cleaned);
  const normalized = validated.normalized; // registry-accepted subset

  const nextSlice: TalentDesignSlice = {
    ...current,
    tokensDraft: normalized,
    version: current.version + 1,
  };
  try {
    const saved = await persistDesignSlice(resolved.supabase, resolved.row, nextSlice);
    if (!saved.ok) return { ok: false, error: saved.error };
    return { ok: true, version: nextSlice.version, themeDraft: nextSlice.tokensDraft };
  } catch (error) {
    logServerError("talent-design/save-draft", error);
    return { ok: false, error: "Could not save theme draft." };
  }
}

// ── save component-style defaults draft ─────────────────────────────────────

/**
 * Replace `__design.componentStylesDraft` with the operator's full working map
 * and bump the slice version. Sibling of `saveComponentStylesDraftFromEditAction`.
 */
export async function saveTalentComponentStylesDraftAction(input: {
  pageSlug: string;
  componentStyles: ComponentStyleDefaults;
  expectedVersion: number;
}): Promise<ComponentStylesSaveResult> {
  const resolved = await resolveOwnTalentPageRow(input.pageSlug);
  if (!resolved.ok) return { ok: false, error: resolved.error, code: resolved.code };

  const current = readTalentDesignSlice(resolved.row.theme);
  if (current.version !== input.expectedVersion) {
    return {
      ok: false,
      error: "Theme changed elsewhere; reload and try again.",
      code: "VERSION_CONFLICT",
      currentVersion: current.version,
    };
  }

  const normalized = normalizeComponentStyleDefaults(input.componentStyles);
  const nextSlice: TalentDesignSlice = {
    ...current,
    componentStylesDraft: normalized,
    version: current.version + 1,
  };
  try {
    const saved = await persistDesignSlice(resolved.supabase, resolved.row, nextSlice);
    if (!saved.ok) return { ok: false, error: saved.error };
    return {
      ok: true,
      version: nextSlice.version,
      componentStylesDraft: normalized,
    };
  } catch (error) {
    logServerError("talent-design/save-component-styles", error);
    return { ok: false, error: "Could not save component defaults." };
  }
}

// ── apply preset ────────────────────────────────────────────────────────────

/**
 * Merge a curated theme preset bundle into `__design.tokensDraft` (draft only —
 * the talent must Publish to go live). Mirrors `applyThemePresetFromEditAction`.
 * The preset tokens are re-validated against the registry as defence-in-depth.
 */
export async function applyTalentThemePresetAction(input: {
  pageSlug: string;
  presetSlug: string;
  expectedVersion: number;
}): Promise<DesignPresetResult> {
  const preset = getThemePreset(input.presetSlug);
  if (!preset) {
    return { ok: false, error: "Unknown theme preset.", code: "NOT_FOUND" };
  }

  const resolved = await resolveOwnTalentPageRow(input.pageSlug);
  if (!resolved.ok) return { ok: false, error: resolved.error, code: resolved.code };

  const current = readTalentDesignSlice(resolved.row.theme);
  if (current.version !== input.expectedVersion) {
    return {
      ok: false,
      error: "Theme changed elsewhere; reload and try again.",
      code: "VERSION_CONFLICT",
      currentVersion: current.version,
    };
  }

  const validated = validateThemePatch(preset.tokens);
  const nextSlice: TalentDesignSlice = {
    ...current,
    tokensDraft: validated.normalized,
    presetSlug: preset.slug,
    version: current.version + 1,
  };
  try {
    const saved = await persistDesignSlice(resolved.supabase, resolved.row, nextSlice);
    if (!saved.ok) return { ok: false, error: saved.error };
    return {
      ok: true,
      version: nextSlice.version,
      themeDraft: nextSlice.tokensDraft,
      presetSlug: nextSlice.presetSlug ?? preset.slug,
    };
  } catch (error) {
    logServerError("talent-design/apply-preset", error);
    return { ok: false, error: "Could not apply theme preset." };
  }
}

// ── publish ───────────────────────────────────────────────────────────────

/**
 * Promote `__design.tokensDraft` → `__design.tokens` (and the component-style
 * draft → live), stamp `publishedAt`, bump version. The published `/t/...`
 * render reads the LIVE tokens. Mirrors `publishDesignFromEditAction` (minus the
 * tenant cache-bust — the talent page is `force-dynamic`/`force-no-store`, so a
 * fresh read always reflects the new live tokens).
 */
export async function publishTalentDesignAction(input: {
  pageSlug: string;
  expectedVersion: number;
}): Promise<DesignPublishResult> {
  const resolved = await resolveOwnTalentPageRow(input.pageSlug);
  if (!resolved.ok) return { ok: false, error: resolved.error, code: resolved.code };

  const current = readTalentDesignSlice(resolved.row.theme);
  if (current.version !== input.expectedVersion) {
    return {
      ok: false,
      error: "Theme changed elsewhere; reload and try again.",
      code: "VERSION_CONFLICT",
      currentVersion: current.version,
    };
  }

  // Re-validate the draft before it goes live (defence-in-depth against a
  // registry lockdown between save and publish).
  const validatedTokens = validateThemePatch(current.tokensDraft).normalized;
  const nextSlice: TalentDesignSlice = {
    ...current,
    tokens: validatedTokens,
    componentStyles: normalizeComponentStyleDefaults(current.componentStylesDraft),
    publishedAt: new Date().toISOString(),
    version: current.version + 1,
  };
  try {
    const saved = await persistDesignSlice(resolved.supabase, resolved.row, nextSlice);
    if (!saved.ok) return { ok: false, error: saved.error };
    return { ok: true, version: nextSlice.version, theme: nextSlice.tokens };
  } catch (error) {
    logServerError("talent-design/publish", error);
    return { ok: false, error: "Could not publish theme." };
  }
}
