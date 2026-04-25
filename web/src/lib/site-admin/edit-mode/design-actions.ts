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
  designSaveDraftSchema,
} from "@/lib/site-admin/forms/design";
import {
  loadDesignForStaff,
  publishDesign,
  saveDesignDraft,
} from "@/lib/site-admin/server/design";
import { tokenDefaults } from "@/lib/site-admin/tokens/registry";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
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

// ── load ──────────────────────────────────────────────────────────────────

/**
 * Single read the ThemeDrawer makes on open. Returns the full design snapshot
 * (live + draft + version + preset slug + last-publish timestamp) in one
 * round-trip — no separate "fetch draft" then "fetch live" paths.
 */
export async function loadDesignAction(): Promise<DesignLoadResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing design tokens.",
    };
  }

  try {
    const row = await loadDesignForStaff(auth.supabase, scope.tenantId);
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
}): Promise<DesignSaveResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
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
}): Promise<DesignPublishResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
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
