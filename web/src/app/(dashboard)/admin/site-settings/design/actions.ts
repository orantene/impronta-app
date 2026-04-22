"use server";

/**
 * Phase 5 / M6 — design server actions (thin wrappers).
 *
 * Three actions, all follow the M3/M4/M5 shape:
 *   1. guard staff + tenant scope,
 *   2. parse the envelope via the Zod schema from `forms/design.ts`,
 *   3. delegate to the lib-layer op (capability / CAS / audit / revision
 *      / cache discipline lives there, not here),
 *   4. return a tagged-union `DesignActionState` for the client hook.
 *
 * Token-shape handling:
 *   - `saveDesignDraftAction` reads `patch` as a JSON-serialised string (the
 *     client form serialises its field values into one blob). We strip out
 *     any empty-string entries before handing them to Zod so operators who
 *     clear a field back to the default don't force a validation error —
 *     the registry validator won't accept `""` for a hex or an enum.
 *   - The schema's `validateThemePatch` gate still enforces the allowlist
 *     at parse time; the server op re-validates defensively at write time.
 */

import {
  designPublishSchema,
  designRestoreRevisionSchema,
  designSaveDraftSchema,
} from "@/lib/site-admin";
import {
  applyThemePreset,
  publishDesign,
  restoreDesignRevision,
  saveDesignDraft,
} from "@/lib/site-admin/server/design";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

// ---- shared state --------------------------------------------------------

export type DesignActionState =
  | { ok: true; message: string; version: number }
  | {
      ok: false;
      error: string;
      fieldErrors?: Record<string, string>;
      code?: string;
      currentVersion?: number;
    }
  | undefined;

function single(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

import { coachZodFieldErrors } from "@/lib/site-admin/validation-coach";

function zodErrorsToFieldMap(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): Record<string, string> {
  return coachZodFieldErrors(error);
}

function mapResultError(result: {
  code: string;
  message?: string;
  currentVersion?: number;
}): DesignActionState {
  if (result.code === "VERSION_CONFLICT") {
    return {
      ok: false,
      error: "Someone else edited this design; reload and try again.",
      code: result.code,
      currentVersion: result.currentVersion,
    };
  }
  if (result.code === "NOT_FOUND") {
    return {
      ok: false,
      error:
        result.message ??
        "Branding row missing. Initialise branding before editing design tokens.",
      code: result.code,
    };
  }
  if (result.code === "TOKEN_NOT_OVERRIDABLE") {
    return {
      ok: false,
      error:
        result.message ??
        "One or more tokens aren't agency-configurable; reset them to defaults.",
      code: result.code,
    };
  }
  if (result.code === "PUBLISH_NOT_READY") {
    return {
      ok: false,
      error:
        result.message ??
        "Draft has tokens that are no longer valid; re-save before publishing.",
      code: result.code,
    };
  }
  if (result.code === "FORBIDDEN") {
    return {
      ok: false,
      error: result.message ?? "Not authorized.",
      code: result.code,
    };
  }
  return {
    ok: false,
    error: result.message ?? CLIENT_ERROR.update,
    code: result.code,
  };
}

// Collect every form field whose name starts with `token.<key>` into a
// `{ key: value }` patch map. Empty strings drop (operator cleared the
// field → fall back to registry default). The registry's `validateThemePatch`
// gate catches unknown keys.
function collectPatch(formData: FormData): Record<string, string> {
  const patch: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("token.")) continue;
    if (typeof value !== "string") continue;
    const key = name.slice("token.".length);
    if (value.length === 0) continue;
    patch[key] = value;
  }
  return patch;
}

// ---- save draft ----------------------------------------------------------

export async function saveDesignDraftAction(
  _prev: DesignActionState,
  formData: FormData,
): Promise<DesignActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing design tokens.",
    };
  }

  const parsed = designSaveDraftSchema.safeParse({
    tenantId: scope.tenantId,
    expectedVersion: Number(single(formData, "expectedVersion") || "0"),
    patch: collectPatch(formData),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Some tokens need attention.",
      fieldErrors: zodErrorsToFieldMap(parsed.error),
    };
  }

  try {
    const result = await saveDesignDraft(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapResultError(result);
    return {
      ok: true,
      message: "Design draft saved.",
      version: result.data.version,
    };
  } catch (error) {
    logServerError("site-admin/design/save", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- publish -------------------------------------------------------------

export async function publishDesignAction(
  _prev: DesignActionState,
  formData: FormData,
): Promise<DesignActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before publishing design.",
    };
  }

  const parsed = designPublishSchema.safeParse({
    tenantId: scope.tenantId,
    expectedVersion: Number(single(formData, "expectedVersion") || "0"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Publish request was malformed. Reload and try again.",
      fieldErrors: zodErrorsToFieldMap(parsed.error),
    };
  }

  try {
    const result = await publishDesign(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapResultError(result);
    return {
      ok: true,
      message: "Design published.",
      version: result.data.version,
    };
  } catch (error) {
    logServerError("site-admin/design/publish", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- apply preset (M7) ---------------------------------------------------

/**
 * Apply a theme preset bundle to the current draft. Merges the preset's
 * token values on top of the existing draft (preserves orthogonal
 * customisations). Sets `agency_branding.theme_preset_slug` to the chosen
 * preset so the admin UI can render "Editorial Bridal (modified)" state.
 */
export async function applyThemePresetAction(
  _prev: DesignActionState,
  formData: FormData,
): Promise<DesignActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before applying a preset.",
    };
  }

  const presetSlug = single(formData, "presetSlug");
  const expectedVersion = Number(single(formData, "expectedVersion") || "0");

  if (!presetSlug) {
    return { ok: false, error: "Choose a preset before applying." };
  }

  try {
    const result = await applyThemePreset(auth.supabase, {
      tenantId: scope.tenantId,
      presetSlug,
      expectedVersion,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapResultError(result);
    return {
      ok: true,
      message: `Applied preset "${result.data.presetSlug}" to draft. Review and publish to go live.`,
      version: result.data.version,
    };
  } catch (error) {
    logServerError("site-admin/design/apply-preset", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- restore revision ----------------------------------------------------

export async function restoreDesignRevisionAction(
  _prev: DesignActionState,
  formData: FormData,
): Promise<DesignActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before restoring a revision.",
    };
  }

  const parsed = designRestoreRevisionSchema.safeParse({
    tenantId: scope.tenantId,
    revisionId: single(formData, "revisionId"),
    expectedVersion: Number(single(formData, "expectedVersion") || "0"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Restore request was malformed. Reload and try again.",
      fieldErrors: zodErrorsToFieldMap(parsed.error),
    };
  }

  try {
    const result = await restoreDesignRevision(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapResultError(result);
    return {
      ok: true,
      message: "Design draft restored from revision.",
      version: result.data.version,
    };
  } catch (error) {
    logServerError("site-admin/design/restore", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}
