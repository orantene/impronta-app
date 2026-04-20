"use server";

/**
 * Phase 5 / M2 — navigation server actions (thin wrappers).
 *
 * Each action:
 *   1. guards staff role + tenant scope,
 *   2. parses its own Zod shape from FormData,
 *   3. delegates to the lib-layer operation (capability / CAS / audit /
 *      revision / cache discipline lives there),
 *   4. returns a tagged-union state for the client `useActionState` hooks.
 */

import {
  navItemDeleteSchema,
  navItemDraftSchema,
  navPublishSchema,
} from "@/lib/site-admin";
import {
  deleteNavItem,
  publishNavigationMenu,
  upsertNavItem,
} from "@/lib/site-admin/server/navigation";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

// ---- shared state shape --------------------------------------------------

export type NavActionState =
  | { ok: true; message: string; version?: number }
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

function singleOrNull(formData: FormData, name: string): string | null {
  const v = formData.get(name);
  if (typeof v !== "string" || v === "") return null;
  return v;
}

function zodErrorsToFieldMap(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key =
      issue.path.map((p) => String(p)).join(".") || "_form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function mapActionError(result: {
  code: string;
  message?: string;
  currentVersion?: number;
}): NavActionState {
  if (result.code === "VERSION_CONFLICT") {
    return {
      ok: false,
      error: "Someone else edited this item or menu; reload and try again.",
      code: result.code,
      currentVersion: result.currentVersion,
    };
  }
  if (result.code === "NOT_FOUND") {
    return {
      ok: false,
      error: "Nav item not found. Reload to see the latest list.",
      code: result.code,
    };
  }
  if (result.code === "VALIDATION_FAILED") {
    return {
      ok: false,
      error: result.message ?? "Navigation tree failed validation.",
      code: result.code,
    };
  }
  return {
    ok: false,
    error: result.message ?? CLIENT_ERROR.update,
    code: result.code,
  };
}

// ---- upsert a single draft item ------------------------------------------

export async function saveNavItemAction(
  _prev: NavActionState,
  formData: FormData,
): Promise<NavActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing navigation.",
    };
  }

  const visibleRaw = single(formData, "visible");
  const parsed = navItemDraftSchema.safeParse({
    id: singleOrNull(formData, "id"),
    zone: single(formData, "zone"),
    locale: single(formData, "locale"),
    parentId: singleOrNull(formData, "parentId"),
    label: single(formData, "label"),
    href: single(formData, "href"),
    sortOrder: Number(single(formData, "sortOrder") || "0"),
    visible: visibleRaw === "false" ? false : true,
    expectedVersion: Number(single(formData, "expectedVersion") || "0"),
  });

  if (!parsed.success) {
    return {
      ok: false,
      error: "Some fields need attention.",
      fieldErrors: zodErrorsToFieldMap(parsed.error),
    };
  }

  try {
    const result = await upsertNavItem(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return {
      ok: true,
      version: result.data.version,
      message: parsed.data.id ? "Nav item saved." : "Nav item added.",
    };
  } catch (error) {
    logServerError("site-admin/navigation/save-item", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- delete draft item ----------------------------------------------------

export async function deleteNavItemAction(
  _prev: NavActionState,
  formData: FormData,
): Promise<NavActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing navigation.",
    };
  }

  const parsed = navItemDeleteSchema.safeParse({
    id: single(formData, "id"),
    zone: single(formData, "zone"),
    locale: single(formData, "locale"),
    expectedVersion: Number(single(formData, "expectedVersion") || "0"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid delete request.",
      fieldErrors: zodErrorsToFieldMap(parsed.error),
    };
  }

  try {
    const result = await deleteNavItem(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return { ok: true, message: "Nav item deleted." };
  } catch (error) {
    logServerError("site-admin/navigation/delete-item", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- publish --------------------------------------------------------------

export async function publishNavigationAction(
  _prev: NavActionState,
  formData: FormData,
): Promise<NavActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before publishing navigation.",
    };
  }

  const parsed = navPublishSchema.safeParse({
    zone: single(formData, "zone"),
    locale: single(formData, "locale"),
    expectedMenuVersion: Number(single(formData, "expectedMenuVersion") || "0"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid publish request.",
      fieldErrors: zodErrorsToFieldMap(parsed.error),
    };
  }

  try {
    const result = await publishNavigationMenu(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return {
      ok: true,
      version: result.data.version,
      message: `Published v${result.data.version}.`,
    };
  } catch (error) {
    logServerError("site-admin/navigation/publish", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized to publish." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}
