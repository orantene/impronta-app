"use server";

/**
 * Edit-chrome design (theme) actions — typed wrappers over the M6 design ops.
 *
 * The /admin/site-settings/design route already ships FormData-shaped actions
 * for its useActionState form. The edit chrome's ThemeDrawer needs the same
 * three lifecycle moves (load / save draft / publish) but in a typed,
 * React-state-driven shape so the drawer can render an immediate optimistic
 * preview, save in the background, and surface VERSION_CONFLICT cleanly
 * without round-tripping through FormData.
 *
 * Both surfaces delegate to the same lib-layer ops in
 * `web/src/lib/site-admin/server/design.ts` so capability / tenant-scope /
 * CAS / audit / revision / cache-bust discipline is identical to the admin
 * settings path. Zero business logic duplicated here.
 *
 * Patch semantics: the lib op replaces theme_json_draft entirely with the
 * normalised patch — partial-patch semantics invite stale-field bugs (the
 * UI always submits the full set of operator-edited tokens, so a missing
 * key means the operator cleared it back to the registry default). The
 * drawer calls `loadDesign` once on open to seed the working copy, then
 * sends every subsequent save with the FULL working copy.
 */

import {
  designPublishSchema,
  designRestoreRevisionSchema,
  designSaveDraftSchema,
} from "@/lib/site-admin/forms/design";
import {
  applyThemePreset,
  loadDesignForStaff,
  loadOrInitDesignForStaff,
  publishDesign,
  restoreDesignRevision,
  saveComponentStylesDraft,
  saveDesignDraft,
} from "@/lib/site-admin/server/design";
import { getCardKit } from "@/lib/site-admin/presets/card-kits";
import {
  normalizeComponentStyleDefaults,
  type ComponentStyleDefaults,
} from "@/lib/site-admin/builder-node/component-style-defaults";
import { tokenDefaults } from "@/lib/site-admin/tokens/registry";
import { requireSession } from "@/lib/server/action-guards";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getEditSurfaceTenantScope } from "@/lib/saas/edit-surface-scope";
import { logServerError } from "@/lib/server/safe-error";

// ── types ─────────────────────────────────────────────────────────────────

export interface DesignSnapshot {
  /** Current draft tokens (operator's working copy). Falls back to defaults
   * for any registry key not present in the row. */
  themeDraft: Record<string, string>;
  /** Currently-live tokens (what the storefront actually renders). Same
   * default-fallback contract as themeDraft. */
  themeLive: Record<string, string>;
  /** Slug of the most recently applied preset (if any) — used by the UI to
   * render "Editorial Bridal (with overrides)". `null` for fully-custom
   * tenants. */
  presetSlug: string | null;
  /** ISO timestamp of the last theme_json publish. Null until first publish. */
  themePublishedAt: string | null;
  /** CAS version on the shared agency_branding row. */
  version: number;
  /** GAP B — per-component-type DEFAULT styles, draft + live. Empty `{}` when
   * the tenant has never set component defaults. */
  componentStylesDraft: ComponentStyleDefaults;
  componentStylesLive: ComponentStyleDefaults;
}

export type DesignLoadResult =
  | { ok: true; snapshot: DesignSnapshot }
  | { ok: false; error: string; code?: string };

export type DesignSaveResult =
  | { ok: true; version: number; themeDraft: Record<string, string> }
  | {
      ok: false;
      error: string;
      code?: string;
      currentVersion?: number;
      fieldErrors?: Record<string, string>;
    };

export type DesignPresetResult =
  | {
      ok: true;
      version: number;
      themeDraft: Record<string, string>;
      presetSlug: string;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      currentVersion?: number;
    };

export type DesignPublishResult =
  | { ok: true; version: number; theme: Record<string, string> }
  | {
      ok: false;
      error: string;
      code?: string;
      currentVersion?: number;
    };

// ── helpers ───────────────────────────────────────────────────────────────

/**
 * Merge platform defaults under the operator's stored map so the UI always
 * has a value to render for every agency-configurable key. The drawer can
 * still tell which keys are "set" (operator-edited) vs "default" by
 * comparing against `tokenDefaults()` — the merge is purely a render
 * convenience.
 */
function withDefaults(
  raw: Record<string, unknown> | null | undefined,
): Record<string, string> {
  const out: Record<string, string> = { ...tokenDefaults() };
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.length > 0) {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Resolve the tenant scope for an edit-mode design action.
 *
 * When a `tenantSlug` is supplied — the workspace-admin Card Design studio
 * passes the URL slug from `/<slug>/admin/...`, which is URL-authoritative —
 * resolve from the slug via `getTenantScopeBySlug`. This is the fix for a
 * multi-workspace operator: their `impronta.active_tenant_id` cookie may point
 * at a DIFFERENT workspace than the one they're viewing, so the cookie-based
 * `getTenantScope` would load (or fail on) the wrong tenant — leaving the
 * studio stuck on "Loading…". The slug is unambiguous.
 *
 * Without a slug (the storefront edit-chrome ThemeDrawer) resolve from the
 * SURFACE via `getEditSurfaceTenantScope`: the host context middleware proved
 * against `agency_domains`, verified against the actor's memberships. That is
 * the same "the URL is authoritative, the cookie is not" rule as the slug
 * branch, applied to host-addressed storefronts (P1, 2026-08-07). Both helpers
 * return `null` when no scope can be proven; callers treat that as "no
 * workspace selected".
 *
 * AUTH MODEL (2026-08-04 fix): these actions guard with `requireSession` +
 * tenant scope (membership proof), NOT `requireStaff`. `requireStaff` checks
 * the GLOBAL `profiles.app_role`, which rejects hybrid workspace owners — a
 * talent/client-signup user who owns or staffs a workspace keeps
 * `app_role='talent'`/`'client'` (see workspace-lifecycle.ts). The workspace
 * layout admits them via the membership-based `agency.workspace.view`
 * capability, so the Card Design studio rendered but every action here
 * failed "Not authorized." on their tenants. Authorization is enforced by:
 *   (a) scope resolution — `getTenantScopeBySlug`/`getTenantScope` return
 *       null unless the caller has an agency_memberships row for the tenant;
 *   (b) the lib ops' `agency.site_admin.design.edit|publish` capability
 *       checks (membership-role based, admin/owner only);
 *   (c) RLS — `is_staff_of_tenant()` is membership-based, not app_role-based.
 */
async function resolveDesignScope(tenantSlug: string | undefined) {
  return tenantSlug ? getTenantScopeBySlug(tenantSlug) : getEditSurfaceTenantScope();
}

// ── load ──────────────────────────────────────────────────────────────────

/**
 * Single read the ThemeDrawer makes on open. Returns the full design snapshot
 * (live + draft + version + preset slug + last-publish timestamp) in one
 * round-trip — no separate "fetch draft" then "fetch live" paths.
 */
export async function loadDesignAction(input?: {
  /** Workspace URL slug — resolves the tenant from the URL (admin studio). */
  tenantSlug?: string;
}): Promise<DesignLoadResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await resolveDesignScope(input?.tenantSlug);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing design tokens.",
    };
  }

  try {
    const row = await loadOrInitDesignForStaff(auth.supabase, scope.tenantId);
    if (!row) {
      return {
        ok: false,
        error: "Branding row missing. Initialise branding before editing the theme.",
        code: "NOT_FOUND",
      };
    }
    return {
      ok: true,
      snapshot: {
        themeDraft: withDefaults(row.theme_json_draft),
        themeLive: withDefaults(row.theme_json),
        presetSlug: row.theme_preset_slug ?? null,
        themePublishedAt: row.theme_published_at ?? null,
        version: row.version,
        componentStylesDraft: normalizeComponentStyleDefaults(
          row.component_styles_json_draft,
        ),
        componentStylesLive: normalizeComponentStyleDefaults(
          row.component_styles_json,
        ),
      },
    };
  } catch (error) {
    logServerError("edit-mode/load-design", error);
    return { ok: false, error: "Failed to load theme." };
  }
}

// ── save draft ────────────────────────────────────────────────────────────

/**
 * Replace the theme_json_draft with the normalised patch and bump the row's
 * CAS version. No cache bust — drafts have no public effect. Re-validates
 * against the registry both at the form layer and inside the lib op.
 *
 * Empty-string values are dropped before submission; the registry validator
 * rejects empties for hex/enum tokens, and a missing key just means "fall
 * back to the platform default" at render time. Operators clearing a field
 * on purpose surfaces here as a key drop, not a Zod error.
 */
export async function saveDesignDraftFromEditAction(input: {
  patch: Record<string, string>;
  expectedVersion: number;
  tenantSlug?: string;
}): Promise<DesignSaveResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await resolveDesignScope(input?.tenantSlug);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing design tokens.",
    };
  }

  // Filter out empty-string values up front. The registry validator wouldn't
  // accept them anyway and we want operators to be able to clear a field
  // without seeing a confusing error.
  const cleaned: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.patch)) {
    if (typeof value === "string" && value.length > 0) {
      cleaned[key] = value;
    }
  }

  const parsed = designSaveDraftSchema.safeParse({
    tenantId: scope.tenantId,
    expectedVersion: input.expectedVersion,
    patch: cleaned,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".");
      if (path && !fieldErrors[path]) {
        fieldErrors[path] = issue.message;
      }
    }
    return {
      ok: false,
      error: "Some tokens need attention.",
      code: "VALIDATION_FAILED",
      fieldErrors,
    };
  }

  try {
    const result = await saveDesignDraft(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      if (result.code === "VERSION_CONFLICT") {
        return {
          ok: false,
          error: "Theme changed elsewhere; reload and try again.",
          code: result.code,
          currentVersion: result.currentVersion,
        };
      }
      return {
        ok: false,
        error: result.message ?? "Could not save theme draft.",
        code: result.code,
      };
    }
    return {
      ok: true,
      version: result.data.version,
      themeDraft: result.data.themeDraft,
    };
  } catch (error) {
    logServerError("edit-mode/save-design-draft", error);
    return { ok: false, error: "Could not save theme draft." };
  }
}

// ── save component-style defaults draft (GAP B) ─────────────────────────────

export type ComponentStylesSaveResult =
  | {
      ok: true;
      version: number;
      componentStylesDraft: ComponentStyleDefaults;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      currentVersion?: number;
    };

/**
 * Replace `component_styles_json_draft` with the operator's full working map
 * (per-component-type default styles) and bump the row's CAS version. Sibling
 * of `saveDesignDraftFromEditAction`: same staff/tenant guards, same no-cache-
 * bust (a draft has no storefront effect until Publish copies it across). The
 * full map is sent each save (drop a kind to clear its default).
 */
export async function saveComponentStylesDraftFromEditAction(input: {
  componentStyles: ComponentStyleDefaults;
  expectedVersion: number;
  tenantSlug?: string;
}): Promise<ComponentStylesSaveResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await resolveDesignScope(input?.tenantSlug);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing component defaults.",
    };
  }

  try {
    const result = await saveComponentStylesDraft(auth.supabase, {
      tenantId: scope.tenantId,
      componentStyles: input.componentStyles,
      expectedVersion: input.expectedVersion,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      if (result.code === "VERSION_CONFLICT") {
        return {
          ok: false,
          error: "Theme changed elsewhere; reload and try again.",
          code: result.code,
          currentVersion: result.currentVersion,
        };
      }
      return {
        ok: false,
        error: result.message ?? "Could not save component defaults.",
        code: result.code,
      };
    }
    return {
      ok: true,
      version: result.data.version,
      componentStylesDraft: result.data.componentStylesDraft,
    };
  } catch (error) {
    logServerError("edit-mode/save-component-styles-draft", error);
    return { ok: false, error: "Could not save component defaults." };
  }
}

// ── apply theme preset ─────────────────────────────────────────────────────

/**
 * Apply a curated theme preset (neutral / classic / editorial-bridal /
 * studio-minimal / editorial-noir) to `theme_json_draft`. Delegates to the
 * already-tested `applyThemePreset` lib op — same capability / tenant-scope /
 * CAS / audit discipline as save/publish; zero logic duplicated here.
 *
 * NOTE (honest preview semantics): like every other ThemeDrawer move this
 * writes the DRAFT only. The operator must Publish to promote the preset
 * bundle into `theme_json` (the live storefront). The drawer surfaces this.
 */
export async function applyThemePresetFromEditAction(input: {
  presetSlug: string;
  expectedVersion: number;
  tenantSlug?: string;
}): Promise<DesignPresetResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await resolveDesignScope(input?.tenantSlug);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before applying a theme preset.",
    };
  }

  try {
    const result = await applyThemePreset(auth.supabase, {
      tenantId: scope.tenantId,
      presetSlug: input.presetSlug,
      expectedVersion: input.expectedVersion,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      if (result.code === "VERSION_CONFLICT") {
        return {
          ok: false,
          error: "Theme changed elsewhere; reload and try again.",
          code: result.code,
          currentVersion: result.currentVersion,
        };
      }
      return {
        ok: false,
        error: result.message ?? "Could not apply theme preset.",
        code: result.code,
      };
    }
    return {
      ok: true,
      version: result.data.version,
      themeDraft: result.data.themeDraft,
      presetSlug: result.data.presetSlug,
    };
  } catch (error) {
    logServerError("edit-mode/apply-theme-preset", error);
    return { ok: false, error: "Could not apply theme preset." };
  }
}

// ── apply card kit (P2.2) ───────────────────────────────────────────────────

/**
 * Apply a one-click talent-card KIT (editorial-noir / magazine /
 * minimal-portrait) to `theme_json_draft`. A kit is a NAMED SUBSET of
 * card-family token keys (template.directory-card-family + card.surface /
 * card.name-color / card.muted) — NOT a full theme — so picking one repaints
 * every card surface without stomping the tenant's page canvas, fonts, or
 * accent.
 *
 * Reuses the SAME lifecycle as a plain knob edit (`saveDesignDraft` →
 * `publishDesign`): the kit's tokens are MERGED onto the operator's current
 * draft (kit wins on its keys only, every orthogonal token is preserved),
 * then the full merged map is sent through `saveDesignDraft` so validation +
 * version CAS + audit/revision all apply identically. No new lib op is
 * invented here.
 *
 * Like every other ThemeDrawer move this writes the DRAFT only — the operator
 * must Publish to promote the kit into `theme_json` (the live card surfaces).
 * Auth / tenant / capability resolve exactly like
 * `saveComponentStylesDraftFromEditAction`.
 */
export async function applyCardKitFromEditAction(input: {
  kitSlug: string;
  tenantSlug?: string;
}): Promise<DesignSaveResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await resolveDesignScope(input?.tenantSlug);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before applying a card kit.",
    };
  }

  const kit = getCardKit(input.kitSlug);
  if (!kit) {
    return {
      ok: false,
      error: `Unknown card kit: ${input.kitSlug}`,
      code: "NOT_FOUND",
    };
  }

  try {
    // Read the operator's current working copy so we can MERGE the kit on top
    // (kit wins on its keys only) rather than replacing the whole draft — this
    // preserves any orthogonal card/theme tokens the operator already set.
    // loadDesignForStaff doubles as the CAS read: its version seeds the save.
    const row = await loadDesignForStaff(auth.supabase, scope.tenantId);
    if (!row) {
      return {
        ok: false,
        error: "Branding row missing. Initialise branding before applying a card kit.",
        code: "NOT_FOUND",
      };
    }

    const merged: Record<string, string> = {
      ...row.theme_json_draft,
      ...kit.tokens,
    };

    const parsed = designSaveDraftSchema.safeParse({
      tenantId: scope.tenantId,
      expectedVersion: row.version,
      patch: merged,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (path && !fieldErrors[path]) {
          fieldErrors[path] = issue.message;
        }
      }
      return {
        ok: false,
        error: "This card kit could not be applied.",
        code: "VALIDATION_FAILED",
        fieldErrors,
      };
    }

    const result = await saveDesignDraft(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      if (result.code === "VERSION_CONFLICT") {
        return {
          ok: false,
          error: "Theme changed elsewhere; reload and try again.",
          code: result.code,
          currentVersion: result.currentVersion,
        };
      }
      return {
        ok: false,
        error: result.message ?? "Could not apply card kit.",
        code: result.code,
      };
    }
    return {
      ok: true,
      version: result.data.version,
      themeDraft: result.data.themeDraft,
    };
  } catch (error) {
    logServerError("edit-mode/apply-card-kit", error);
    return { ok: false, error: "Could not apply card kit." };
  }
}

// ── save card-design tokens (merge-on-save) ─────────────────────────────────

/**
 * Persist a PARTIAL token patch from the Card Design studio by MERGING it
 * onto the tenant's current `theme_json_draft` (patch wins on its keys only).
 *
 * Why this exists: `saveDesignDraftFromEditAction` is full-replacement by
 * contract — the ThemeDrawer seeds its working copy from the ENTIRE registry
 * and always submits the full map, so replacement is safe there. The Card
 * Design studio only holds the card-family token keys; sending that subset
 * through the replacement path stripped every orthogonal token (page canvas,
 * fonts, accent, profile layout) from the draft, and the next Publish
 * reverted the live theme to registry defaults. This action gives the studio
 * the same read-merge-save lifecycle `applyCardKitFromEditAction` already
 * uses: `loadDesignForStaff` doubles as the CAS read, the merged FULL map
 * goes through `saveDesignDraft`, so validation + version CAS + audit /
 * revision discipline stay identical.
 *
 * An empty-string value in the patch is an explicit "clear back to theme
 * default" (the registry's hex-or-empty validators accept it), so cleared
 * knobs still clear — they just no longer take the rest of the theme along.
 */
export async function saveCardDesignTokensFromEditAction(input: {
  patch: Record<string, string>;
  tenantSlug?: string;
}): Promise<DesignSaveResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await resolveDesignScope(input?.tenantSlug);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing the card design.",
    };
  }

  try {
    const row = await loadDesignForStaff(auth.supabase, scope.tenantId);
    if (!row) {
      return {
        ok: false,
        error: "Branding row missing. Initialise branding before editing the card design.",
        code: "NOT_FOUND",
      };
    }

    const merged: Record<string, string> = {
      ...row.theme_json_draft,
      ...input.patch,
    };

    const parsed = designSaveDraftSchema.safeParse({
      tenantId: scope.tenantId,
      expectedVersion: row.version,
      patch: merged,
    });
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path.join(".");
        if (path && !fieldErrors[path]) {
          fieldErrors[path] = issue.message;
        }
      }
      return {
        ok: false,
        error: "These card-design changes could not be saved.",
        code: "VALIDATION_FAILED",
        fieldErrors,
      };
    }

    const result = await saveDesignDraft(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      if (result.code === "VERSION_CONFLICT") {
        return {
          ok: false,
          error: "Theme changed elsewhere; reload and try again.",
          code: result.code,
          currentVersion: result.currentVersion,
        };
      }
      return {
        ok: false,
        error: result.message ?? "Could not save the card design.",
        code: result.code,
      };
    }
    return {
      ok: true,
      version: result.data.version,
      themeDraft: result.data.themeDraft,
    };
  } catch (error) {
    logServerError("edit-mode/save-card-design-tokens", error);
    return { ok: false, error: "Could not save the card design." };
  }
}

// ── restore revision (P2.2) ─────────────────────────────────────────────────

/**
 * Restore a prior design revision back into `theme_json_draft`. Like every
 * other ThemeDrawer move this lands as a DRAFT (NO cache bust) — the operator
 * reviews the restored tokens in the live preview, then Publishes to promote
 * them to the live card surfaces. Delegates to the tested `restoreDesignRevision`
 * lib op (capability / CAS / audit / revision discipline identical to save).
 */
export async function restoreDesignRevisionFromEditAction(input: {
  revisionId: string;
  expectedVersion: number;
  tenantSlug?: string;
}): Promise<DesignSaveResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await resolveDesignScope(input?.tenantSlug);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before restoring a revision.",
    };
  }

  const parsed = designRestoreRevisionSchema.safeParse({
    tenantId: scope.tenantId,
    revisionId: input.revisionId,
    expectedVersion: input.expectedVersion,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Restore request was malformed. Reload and try again.",
      code: "VALIDATION_FAILED",
    };
  }

  try {
    const result = await restoreDesignRevision(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      if (result.code === "VERSION_CONFLICT") {
        return {
          ok: false,
          error: "Theme changed elsewhere; reload and try again.",
          code: result.code,
          currentVersion: result.currentVersion,
        };
      }
      return {
        ok: false,
        error: result.message ?? "Could not restore that revision.",
        code: result.code,
      };
    }
    return {
      ok: true,
      version: result.data.version,
      themeDraft: result.data.themeDraft,
    };
  } catch (error) {
    logServerError("edit-mode/restore-design-revision", error);
    return { ok: false, error: "Could not restore that revision." };
  }
}

// ── publish ───────────────────────────────────────────────────────────────

/**
 * Promote theme_json_draft → theme_json. Capability `agency.site_admin.design.publish`,
 * stamps `theme_published_at`, mints a `kind='published'` revision row, and
 * busts the branding + storefront cache tags so the live storefront picks
 * up the new tokens on the next read.
 *
 * Re-validates the current draft against the registry inside the lib op so
 * a registry lockdown between save and publish surfaces as PUBLISH_NOT_READY
 * rather than leaking a stale token into the live row.
 */
export async function publishDesignFromEditAction(input: {
  expectedVersion: number;
  tenantSlug?: string;
}): Promise<DesignPublishResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await resolveDesignScope(input?.tenantSlug);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before publishing the theme.",
    };
  }

  const parsed = designPublishSchema.safeParse({
    tenantId: scope.tenantId,
    expectedVersion: input.expectedVersion,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Publish request was malformed. Reload and try again.",
      code: "VALIDATION_FAILED",
    };
  }

  try {
    const result = await publishDesign(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      if (result.code === "VERSION_CONFLICT") {
        return {
          ok: false,
          error: "Theme changed elsewhere; reload and try again.",
          code: result.code,
          currentVersion: result.currentVersion,
        };
      }
      return {
        ok: false,
        error: result.message ?? "Could not publish theme.",
        code: result.code,
      };
    }
    return {
      ok: true,
      version: result.data.version,
      theme: result.data.theme,
    };
  } catch (error) {
    logServerError("edit-mode/publish-design", error);
    return { ok: false, error: "Could not publish theme." };
  }
}
