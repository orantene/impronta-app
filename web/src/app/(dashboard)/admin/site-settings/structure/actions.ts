"use server";

/**
 * Phase 5 / M5 — homepage composer server actions (thin wrappers).
 *
 * Each action:
 *   1. guards staff + tenant scope,
 *   2. parses its own Zod shape from FormData (slots JSON deserialized from
 *      a hidden field),
 *   3. delegates to the lib-layer op (capability / CAS / audit / revision /
 *      cache discipline lives there),
 *   4. returns a tagged-union state for `useActionState` hooks.
 *
 * Slots serialization:
 *   - The composer form writes `<input type="hidden" name="slots">` carrying
 *     a JSON object keyed by slot key → ordered { sectionId, sortOrder }[].
 *     Actions JSON.parse that field before Zod parse. Malformed JSON is a
 *     client bug; we surface it as a `slots` field error.
 */

import {
  homepagePublishSchema,
  homepageRestoreRevisionSchema,
  homepageSaveDraftSchema,
} from "@/lib/site-admin";
import {
  publishHomepage,
  restoreHomepageRevision,
  saveHomepageDraftComposition,
} from "@/lib/site-admin/server/homepage";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

// ---- state ----------------------------------------------------------------

export type HomepageActionState =
  | { ok: true; message: string; id?: string; version?: number }
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

function zodErrorsToFieldMap(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.map((p) => String(p)).join(".") || "_form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function mapActionError(result: {
  code: string;
  message?: string;
  currentVersion?: number;
}): HomepageActionState {
  if (result.code === "VERSION_CONFLICT") {
    return {
      ok: false,
      error: "Someone else edited the homepage; reload and try again.",
      code: result.code,
      currentVersion: result.currentVersion,
    };
  }
  if (result.code === "NOT_FOUND") {
    return {
      ok: false,
      error: "Homepage row not found. Reload the page to re-seed.",
      code: result.code,
    };
  }
  if (result.code === "PUBLISH_NOT_READY") {
    return {
      ok: false,
      error: result.message ?? "Homepage is not ready to publish.",
      code: result.code,
    };
  }
  if (result.code === "VALIDATION_FAILED") {
    return {
      ok: false,
      error: result.message ?? "Validation failed.",
      code: result.code,
    };
  }
  if (result.code === "MEDIA_REF_BROKEN") {
    return {
      ok: false,
      error:
        result.message ??
        "The homepage references a media asset that no longer exists.",
      code: result.code,
    };
  }
  if (result.code === "SYSTEM_PAGE_IMMUTABLE") {
    return {
      ok: false,
      error:
        result.message ??
        "Locked fields on the homepage cannot be modified from this path.",
      code: result.code,
    };
  }
  return {
    ok: false,
    error: result.message ?? CLIENT_ERROR.update,
    code: result.code,
  };
}

// ---- save draft -----------------------------------------------------------

export async function saveHomepageDraftAction(
  _prev: HomepageActionState,
  formData: FormData,
): Promise<HomepageActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing the homepage.",
    };
  }

  let slots: unknown;
  try {
    const raw = single(formData, "slots");
    slots = raw ? JSON.parse(raw) : {};
  } catch {
    return {
      ok: false,
      error: "Composer is out of sync. Reload the page and try again.",
      fieldErrors: { slots: "Invalid slots payload" },
    };
  }

  const parsed = homepageSaveDraftSchema.safeParse({
    tenantId: scope.tenantId,
    locale: single(formData, "locale"),
    expectedVersion: Number(single(formData, "expectedVersion") || "0"),
    metadata: {
      title: single(formData, "title"),
      metaDescription: single(formData, "metaDescription") || undefined,
      introTagline: single(formData, "introTagline") || undefined,
    },
    slots,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Some fields need attention.",
      fieldErrors: zodErrorsToFieldMap(parsed.error),
    };
  }

  try {
    const result = await saveHomepageDraftComposition(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return {
      ok: true,
      id: result.data.id,
      version: result.data.version,
      message: "Draft saved.",
    };
  } catch (error) {
    logServerError("site-admin/homepage/save", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized to compose the homepage." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- publish --------------------------------------------------------------

export async function publishHomepageAction(
  _prev: HomepageActionState,
  formData: FormData,
): Promise<HomepageActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before publishing the homepage.",
    };
  }

  const parsed = homepagePublishSchema.safeParse({
    tenantId: scope.tenantId,
    locale: single(formData, "locale"),
    expectedVersion: Number(single(formData, "expectedVersion") || "0"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid publish request.",
      fieldErrors: zodErrorsToFieldMap(parsed.error),
    };
  }

  try {
    const result = await publishHomepage(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return {
      ok: true,
      id: result.data.id,
      version: result.data.version,
      message: `Homepage published v${result.data.version}.`,
    };
  } catch (error) {
    logServerError("site-admin/homepage/publish", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized to publish the homepage." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- restore revision -----------------------------------------------------

export async function restoreHomepageRevisionAction(
  _prev: HomepageActionState,
  formData: FormData,
): Promise<HomepageActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before restoring a revision.",
    };
  }

  const parsed = homepageRestoreRevisionSchema.safeParse({
    tenantId: scope.tenantId,
    locale: single(formData, "locale"),
    revisionId: single(formData, "revisionId"),
    expectedVersion: Number(single(formData, "expectedVersion") || "0"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid restore request.",
      fieldErrors: zodErrorsToFieldMap(parsed.error),
    };
  }

  try {
    const result = await restoreHomepageRevision(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return {
      ok: true,
      id: result.data.id,
      version: result.data.version,
      message: "Revision restored as draft. Review and publish when ready.",
    };
  } catch (error) {
    logServerError("site-admin/homepage/restore", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized to restore a revision." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}
