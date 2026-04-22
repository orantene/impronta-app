"use server";

/**
 * Phase 5 / M4 — section server actions (thin wrappers).
 *
 * Each action:
 *   1. guards staff role + tenant scope,
 *   2. parses its own Zod shape from FormData (props deserialized from a
 *      hidden JSON field so the editor can carry a structured payload),
 *   3. delegates to the lib-layer operation (capability / CAS / audit /
 *      revision / cache discipline lives there),
 *   4. returns a tagged-union state for the client `useActionState` hooks.
 *
 * Props serialization:
 *   - The editor renders a type-specific form (SECTION_REGISTRY[key].Editor)
 *     that onChange-writes into a hidden `<input type="hidden" name="props">`
 *     holding JSON. This action JSON.parses that field before Zod parse.
 *   - If the field is absent or not parseable JSON we reject with a
 *     fieldError on `props` — the UI renders it inline.
 */

import { redirect } from "next/navigation";

import {
  sectionArchiveSchema,
  sectionDeleteSchema,
  sectionDuplicateSchema,
  sectionPublishSchema,
  sectionRestoreRevisionSchema,
  sectionUpsertSchema,
} from "@/lib/site-admin";
import {
  archiveSection,
  deleteSection,
  duplicateSection,
  publishSection,
  restoreSectionRevision,
  upsertSection,
} from "@/lib/site-admin/server/sections";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

// ---- shared state shape --------------------------------------------------

export type SectionActionState =
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

import { coachZodFieldErrors } from "@/lib/site-admin/validation-coach";

function zodErrorsToFieldMap(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): Record<string, string> {
  return coachZodFieldErrors(error);
}

function mapActionError(result: {
  code: string;
  message?: string;
  currentVersion?: number;
}): SectionActionState {
  if (result.code === "VERSION_CONFLICT") {
    return {
      ok: false,
      error: "Someone else edited this section; reload and try again.",
      code: result.code,
      currentVersion: result.currentVersion,
    };
  }
  if (result.code === "NOT_FOUND") {
    return {
      ok: false,
      error: "Section not found. Reload to see the latest list.",
      code: result.code,
    };
  }
  if (result.code === "SECTION_IN_USE") {
    return {
      ok: false,
      error:
        result.message ??
        "This section is referenced by a page. Remove it from those pages before deleting.",
      code: result.code,
    };
  }
  if (result.code === "MEDIA_REF_BROKEN") {
    return {
      ok: false,
      error:
        result.message ??
        "This section references a media asset that no longer exists.",
      code: result.code,
    };
  }
  if (result.code === "PUBLISH_NOT_READY") {
    return {
      ok: false,
      error: result.message ?? "Section is not ready to publish.",
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

export async function saveSectionAction(
  _prev: SectionActionState,
  formData: FormData,
): Promise<SectionActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing sections.",
    };
  }

  // Parse the hidden JSON props payload. The editor writes it on every
  // onChange; a malformed value is a client bug, not a user one — surface
  // a field-level error so the editor state-syncs.
  let props: unknown;
  try {
    const rawProps = single(formData, "props");
    props = rawProps ? JSON.parse(rawProps) : {};
  } catch {
    return {
      ok: false,
      error: "Section form is out of sync. Reload the page and try again.",
      fieldErrors: { props: "Invalid props payload" },
    };
  }

  const parsed = sectionUpsertSchema.safeParse({
    id: singleOrNull(formData, "id"),
    tenantId: scope.tenantId,
    sectionTypeKey: single(formData, "sectionTypeKey"),
    schemaVersion: Number(single(formData, "schemaVersion") || "1"),
    name: single(formData, "name"),
    props,
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
    const result = await upsertSection(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return {
      ok: true,
      id: result.data.id,
      version: result.data.version,
      message: parsed.data.id ? "Section saved." : "Section created.",
    };
  } catch (error) {
    logServerError("site-admin/sections/save", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- delete ---------------------------------------------------------------

export async function deleteSectionAction(
  _prev: SectionActionState,
  formData: FormData,
): Promise<SectionActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before editing sections.",
    };
  }

  const parsed = sectionDeleteSchema.safeParse({
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
    const result = await deleteSection(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return { ok: true, message: "Section deleted." };
  } catch (error) {
    logServerError("site-admin/sections/delete", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- publish --------------------------------------------------------------

export async function publishSectionAction(
  _prev: SectionActionState,
  formData: FormData,
): Promise<SectionActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before publishing sections.",
    };
  }

  const parsed = sectionPublishSchema.safeParse({
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
    const result = await publishSection(auth.supabase, {
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
    logServerError("site-admin/sections/publish", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized to publish." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- archive --------------------------------------------------------------

export async function archiveSectionAction(
  _prev: SectionActionState,
  formData: FormData,
): Promise<SectionActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before archiving sections.",
    };
  }

  const parsed = sectionArchiveSchema.safeParse({
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
    const result = await archiveSection(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    return {
      ok: true,
      id: result.data.id,
      version: result.data.version,
      message: "Section archived.",
    };
  } catch (error) {
    logServerError("site-admin/sections/archive", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}

// ---- duplicate -----------------------------------------------------------

/**
 * Clone a section as a new draft. Accepts `sourceId` + optional `newName`
 * from FormData. When newName is absent or empty, the action falls back to
 * `"<source.name> (copy)"` — the UI surfaces this as a placeholder so the
 * default is visible and overridable.
 *
 * The server op loads the source row to resolve the fallback name, so this
 * action only has to pass the raw inputs through.
 */
export async function duplicateSectionAction(
  _prev: SectionActionState,
  formData: FormData,
): Promise<SectionActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before duplicating sections.",
    };
  }

  const sourceId = single(formData, "sourceId");
  const rawName = single(formData, "newName").trim();

  // Resolve the default name server-side so the client doesn't have to
  // carry the source row. A blank newName falls back to "<source.name> (copy)".
  let effectiveName = rawName;
  if (!effectiveName) {
    const { data: source } = await auth.supabase
      .from("cms_sections")
      .select("name")
      .eq("id", sourceId)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle<{ name: string }>();
    if (!source) {
      return {
        ok: false,
        error: "Source section not found. Reload to see the latest list.",
        code: "NOT_FOUND",
      };
    }
    effectiveName = `${source.name} (copy)`;
  }

  const parsed = sectionDuplicateSchema.safeParse({
    sourceId,
    tenantId: scope.tenantId,
    newName: effectiveName,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid duplicate request.",
      fieldErrors: zodErrorsToFieldMap(parsed.error),
    };
  }

  let newId: string | null = null;
  try {
    const result = await duplicateSection(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) return mapActionError(result);
    newId = result.data.id;
  } catch (error) {
    logServerError("site-admin/sections/duplicate", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }

  // Redirect to the new draft's editor. Matches agency workflow: duplicate
  // → immediately refine the copy. `redirect()` throws the Next.js redirect
  // symbol; this must live outside the try/catch above so it isn't caught.
  redirect(`/admin/site-settings/sections/${newId}`);
}

// ---- restore revision ----------------------------------------------------

export async function restoreSectionRevisionAction(
  _prev: SectionActionState,
  formData: FormData,
): Promise<SectionActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before restoring revisions.",
    };
  }

  const parsed = sectionRestoreRevisionSchema.safeParse({
    sectionId: single(formData, "sectionId"),
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
    const result = await restoreSectionRevision(auth.supabase, {
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
    logServerError("site-admin/sections/restore", error);
    if (error instanceof Error && /forbidden/i.test(error.message)) {
      return { ok: false, error: "Not authorized." };
    }
    return { ok: false, error: CLIENT_ERROR.update };
  }
}
