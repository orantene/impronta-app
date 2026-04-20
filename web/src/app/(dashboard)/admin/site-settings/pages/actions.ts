"use server";

/**
 * Phase 5 / M3 — page server actions (thin wrappers).
 *
 * Each action:
 *   1. guards staff role + tenant scope,
 *   2. parses its own Zod shape from FormData,
 *   3. delegates to the lib-layer operation (capability / CAS / audit /
 *      revision / cache discipline lives there),
 *   4. returns a tagged-union state for the client `useActionState` hooks.
 *
 * Preview actions (startPagePreview / endPagePreview) sign or clear the
 * `impronta_preview` HttpOnly cookie. Both require pages.edit capability;
 * the cookie is subject-bound ("page:<id>") so middleware rejects
 * cross-subject reuse.
 */

import { cookies } from "next/headers";

import {
  pageArchiveSchema,
  pageDeleteSchema,
  pagePreviewStartSchema,
  pagePublishSchema,
  pageRestoreRevisionSchema,
  pageUpsertSchema,
  PREVIEW_COOKIE_NAME,
  PREVIEW_COOKIE_OPTIONS,
  signPreviewJwt,
  requirePhase5Capability,
} from "@/lib/site-admin";
import {
  archivePage,
  deletePage,
  publishPage,
  restorePageRevision,
  upsertPage,
} from "@/lib/site-admin/server/pages";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

// ---- shared state shape --------------------------------------------------

export type PageActionState =
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
    const key = issue.path.map((p) => String(p)).join(".") || "_form";
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function mapActionError(result: {
  code: string;
  message?: string;
  currentVersion?: number;
}): PageActionState {
  if (result.code === "VERSION_CONFLICT") {
    return {
      ok: false,
      error: "Someone else edited this page; reload and try again.",
      code: result.code,
      currentVersion: result.currentVersion,
    };
  }
  if (result.code === "NOT_FOUND") {
    return {
      ok: false,
      error: "Page not found. Reload to see the latest list.",
      code: result.code,
    };
  }
  if (result.code === "SYSTEM_PAGE_IMMUTABLE") {
    return {
      ok: false,
      error: result.message ?? "This page is system-owned and cannot change.",
      code: result.code,
    };
  }
  if (result.code === "RESERVED_SLUG") {
    return {
      ok: false,
      error: "That slug is reserved by the platform; choose another.",
      code: result.code,
    };
  }
  if (result.code === "PUBLISH_NOT_READY") {
    return {
      ok: false,
      error: result.message ?? "Page is not ready to publish.",
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
  return {
    ok: false,
    error: result.message ?? CLIENT_ERROR.update,
    code: result.code,
  };
}

// ---- upsert ---------------------------------------------------------------

export async function savePageAction(
  _prev: PageActionState,
  formData: FormData,
): Promise<PageActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing pages.",
    };
  }

  const parsed = pageUpsertSchema.safeParse({
    id: singleOrNull(formData, "id"),
    tenantId: scope.tenantId,
    locale: single(formData, "locale"),
    slug: single(formData, "slug"),
    templateKey: single(formData, "templateKey"),
    templateSchemaVersion: Number(single(formData, "templateSchemaVersion") || "1"),
    title: single(formData, "title"),
    body: single(formData, "body"),
    hero: {
      title: singleOrNull(formData, "heroTitle") ?? undefined,
      subtitle: singleOrNull(formData, "heroSubtitle") ?? undefined,
      eyebrow: singleOrNull(formData, "heroEyebrow") ?? undefined,
    },
    metaTitle: singleOrNull(formData, "metaTitle"),
    metaDescription: singleOrNull(formData, "metaDescription"),
    ogTitle: singleOrNull(formData, "ogTitle"),
    ogDescription: singleOrNull(formData, "ogDescription"),
    ogImageMediaAssetId: singleOrNull(formData, "ogImageMediaAssetId"),
    noindex: single(formData, "noindex") === "true",
    includeInSitemap: single(formData, "includeInSitemap") !== "false",
    canonicalUrl: singleOrNull(formData, "canonicalUrl"),
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
    const result = await upsertPage(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return {
      ok: true,
      id: result.data.id,
      version: result.data.version,
      message: parsed.data.id ? "Page saved." : "Page created.",
    };
  } catch (error) {
    logServerError("site-admin/pages/save", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- delete ---------------------------------------------------------------

export async function deletePageAction(
  _prev: PageActionState,
  formData: FormData,
): Promise<PageActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing pages.",
    };
  }

  const parsed = pageDeleteSchema.safeParse({
    id: single(formData, "id"),
    tenantId: scope.tenantId,
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
    const result = await deletePage(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return { ok: true, message: "Page deleted." };
  } catch (error) {
    logServerError("site-admin/pages/delete", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- publish --------------------------------------------------------------

export async function publishPageAction(
  _prev: PageActionState,
  formData: FormData,
): Promise<PageActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before publishing pages.",
    };
  }

  const parsed = pagePublishSchema.safeParse({
    id: single(formData, "id"),
    tenantId: scope.tenantId,
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
    const result = await publishPage(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return {
      ok: true,
      id: result.data.id,
      version: result.data.version,
      message: `Published v${result.data.version}.`,
    };
  } catch (error) {
    logServerError("site-admin/pages/publish", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized to publish." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- archive --------------------------------------------------------------

export async function archivePageAction(
  _prev: PageActionState,
  formData: FormData,
): Promise<PageActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before archiving pages.",
    };
  }

  const parsed = pageArchiveSchema.safeParse({
    id: single(formData, "id"),
    tenantId: scope.tenantId,
    expectedVersion: Number(single(formData, "expectedVersion") || "0"),
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid archive request.",
      fieldErrors: zodErrorsToFieldMap(parsed.error),
    };
  }

  try {
    const result = await archivePage(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return {
      ok: true,
      id: result.data.id,
      version: result.data.version,
      message: "Page archived.",
    };
  } catch (error) {
    logServerError("site-admin/pages/archive", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- restore revision ----------------------------------------------------

export async function restorePageRevisionAction(
  _prev: PageActionState,
  formData: FormData,
): Promise<PageActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before restoring revisions.",
    };
  }

  const parsed = pageRestoreRevisionSchema.safeParse({
    pageId: single(formData, "pageId"),
    tenantId: scope.tenantId,
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
    const result = await restorePageRevision(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return {
      ok: true,
      id: result.data.id,
      version: result.data.version,
      message: "Revision restored as draft.",
    };
  } catch (error) {
    logServerError("site-admin/pages/restore", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- preview --------------------------------------------------------------

/**
 * Start a preview session for a specific page. Signs an HS256 JWT with
 * subject "page:<id>" and sets the `impronta_preview` HttpOnly cookie.
 * The middleware on public surfaces decodes the cookie and lets the
 * storefront include draft rows for that (tenant, subject) pair.
 *
 * Gated by `agency.site_admin.pages.edit` — any staff who can edit a page
 * can preview it.
 */
export async function startPagePreviewAction(
  _prev: PageActionState,
  formData: FormData,
): Promise<PageActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before previewing.",
    };
  }

  const parsed = pagePreviewStartSchema.safeParse({
    pageId: single(formData, "pageId"),
    tenantId: scope.tenantId,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid preview request.",
      fieldErrors: zodErrorsToFieldMap(parsed.error),
    };
  }

  try {
    await requirePhase5Capability(
      "agency.site_admin.pages.edit",
      parsed.data.tenantId,
    );

    const signed = signPreviewJwt({
      tenantId: parsed.data.tenantId,
      actorProfileId: auth.user.id,
      subject: `page:${parsed.data.pageId}`,
    });

    const cookieStore = await cookies();
    cookieStore.set(PREVIEW_COOKIE_NAME, signed.token, {
      httpOnly: PREVIEW_COOKIE_OPTIONS.httpOnly,
      secure: PREVIEW_COOKIE_OPTIONS.secure,
      sameSite: PREVIEW_COOKIE_OPTIONS.sameSite,
      path: PREVIEW_COOKIE_OPTIONS.path,
      maxAge: PREVIEW_COOKIE_OPTIONS.maxAge,
    });

    return {
      ok: true,
      id: parsed.data.pageId,
      message: "Preview started — valid for 15 minutes.",
    };
  } catch (error) {
    logServerError("site-admin/pages/preview-start", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized to preview." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

/**
 * End the current preview by clearing the cookie. Idempotent — calling it
 * without an active preview still succeeds.
 */
export async function endPagePreviewAction(
  _prev: PageActionState,
  _formData: FormData,
): Promise<PageActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };

  try {
    const cookieStore = await cookies();
    cookieStore.set(PREVIEW_COOKIE_NAME, "", {
      httpOnly: PREVIEW_COOKIE_OPTIONS.httpOnly,
      secure: PREVIEW_COOKIE_OPTIONS.secure,
      sameSite: PREVIEW_COOKIE_OPTIONS.sameSite,
      path: PREVIEW_COOKIE_OPTIONS.path,
      maxAge: 0,
    });
    return { ok: true, message: "Preview ended." };
  } catch (error) {
    logServerError("site-admin/pages/preview-end", error);
    return { ok: false, error: CLIENT_ERROR.update };
  }
}
