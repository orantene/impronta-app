"use server";

/**
 * Edit-mode callable section actions.
 *
 * The composer / section list routes expose `useActionState`-style FormData
 * actions. The canvas inspector needs a simpler shape: call with a typed
 * payload, get a typed result, no FormData serialization in the middle. These
 * wrappers delegate to the same lib-layer ops (`loadSectionByIdForStaff`,
 * `upsertSection`) so capability / CAS / audit / revision / cache-bust
 * discipline is identical.
 *
 * Auth contract on every action:
 *   - `requireStaff` (super_admin | agency_staff)
 *   - `requireTenantScope` matches the cookie-scoped tenant
 *   - the incoming sectionId / tenantId must agree with scope
 */

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { sectionUpsertSchema } from "@/lib/site-admin";
import { upsertSection } from "@/lib/site-admin/server/sections";
import { loadSectionByIdForStaff } from "@/lib/site-admin/server/sections-reads";
import { logServerError } from "@/lib/server/safe-error";

export type EditLoadResult =
  | {
      ok: true;
      section: {
        id: string;
        sectionTypeKey: string;
        schemaVersion: number;
        version: number;
        name: string;
        props: Record<string, unknown>;
      };
    }
  | { ok: false; error: string; code?: string };

export async function loadSectionForEditAction(
  sectionId: string,
): Promise<EditLoadResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Tenant scope required" };

  try {
    const row = await loadSectionByIdForStaff(
      auth.supabase,
      scope.tenantId,
      sectionId,
    );
    if (!row) return { ok: false, error: "Section not found", code: "NOT_FOUND" };
    return {
      ok: true,
      section: {
        id: row.id,
        sectionTypeKey: row.section_type_key,
        schemaVersion: row.schema_version,
        version: row.version,
        name: row.name,
        props: (row.props_jsonb ?? {}) as Record<string, unknown>,
      },
    };
  } catch (error) {
    logServerError("edit-mode/load-section", error);
    return { ok: false, error: "Failed to load section" };
  }
}

export type EditSaveResult =
  | {
      ok: true;
      version: number;
    }
  | {
      ok: false;
      error: string;
      code?: string;
      fieldErrors?: Record<string, string>;
      currentVersion?: number;
    };

export interface EditSaveInput {
  id: string;
  sectionTypeKey: string;
  schemaVersion: number;
  name: string;
  props: Record<string, unknown>;
  expectedVersion: number;
}

/**
 * Autosave entrypoint for the canvas inspector. Re-runs the same Zod +
 * registry gates as the composer's save-button action; the lib op enforces
 * CAS / audit / revision / cache-bust. Callers ratchet `expectedVersion` on
 * every successful save so a tight sequence of edits doesn't deadlock.
 */
export async function saveSectionDraftAction(
  input: EditSaveInput,
): Promise<EditSaveResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Tenant scope required" };

  const parsed = sectionUpsertSchema.safeParse({
    id: input.id,
    tenantId: scope.tenantId,
    sectionTypeKey: input.sectionTypeKey,
    schemaVersion: input.schemaVersion,
    name: input.name,
    props: input.props,
    expectedVersion: input.expectedVersion,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join(".") || "_";
      if (!fieldErrors[path]) fieldErrors[path] = issue.message;
    }
    return {
      ok: false,
      error: "Some fields need attention.",
      code: "VALIDATION_FAILED",
      fieldErrors,
    };
  }

  try {
    const result = await upsertSection(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      if (result.code === "VERSION_CONFLICT") {
        return {
          ok: false,
          error: "Section changed elsewhere; reloading.",
          code: result.code,
          currentVersion: result.currentVersion,
        };
      }
      return {
        ok: false,
        error: result.message ?? "Save failed",
        code: result.code,
      };
    }
    return { ok: true, version: result.data.version };
  } catch (error) {
    logServerError("edit-mode/save-section", error);
    return { ok: false, error: "Save failed" };
  }
}

// ── focused: per-section visibility (Navigator panel) ────────────────────

export type SectionVisibility =
  | "always"
  | "desktop-only"
  | "mobile-only"
  | "hidden";

export type SetSectionVisibilityResult =
  | { ok: true; version: number; visibility: SectionVisibility }
  | { ok: false; error: string; code?: string; currentVersion?: number };

/**
 * Toggle (or set) a single section's `presentation.visibility` without
 * routing through the inspector's full draft props. The Navigator panel
 * calls this when the operator clicks the eye icon on a row — the
 * full-props round-trip via `saveSectionDraftAction` would require the
 * navigator to load every section's draft props up-front, which is why
 * we keep this focused mutation server-side instead of client-side.
 *
 * Implementation: load the section, deep-merge `presentation.visibility`,
 * round-trip through `upsertSection` so all the existing CAS / audit /
 * revision / cache-bust discipline still applies.
 *
 * Setting visibility to `"always"` removes the field outright (the
 * presentation schema is sparse — undefined is the same as "always").
 * Persisting `"always"` literally would needlessly bloat props.
 */
export async function setSectionVisibilityAction(input: {
  sectionId: string;
  visibility: SectionVisibility;
}): Promise<SetSectionVisibilityResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Tenant scope required" };

  try {
    const row = await loadSectionByIdForStaff(
      auth.supabase,
      scope.tenantId,
      input.sectionId,
    );
    if (!row) {
      return { ok: false, error: "Section not found", code: "NOT_FOUND" };
    }

    const props = (row.props_jsonb ?? {}) as Record<string, unknown>;
    const presentationRaw = (props.presentation ?? {}) as Record<
      string,
      unknown
    >;
    const presentation = { ...presentationRaw };
    if (input.visibility === "always") {
      delete presentation.visibility;
    } else {
      presentation.visibility = input.visibility;
    }
    const nextProps: Record<string, unknown> = {
      ...props,
      presentation: Object.keys(presentation).length ? presentation : undefined,
    };
    if (nextProps.presentation === undefined) {
      delete nextProps.presentation;
    }

    const parsed = sectionUpsertSchema.safeParse({
      id: row.id,
      tenantId: scope.tenantId,
      sectionTypeKey: row.section_type_key,
      schemaVersion: row.schema_version,
      name: row.name,
      props: nextProps,
      expectedVersion: row.version,
    });
    if (!parsed.success) {
      return {
        ok: false,
        error: "Visibility update rejected by validator.",
        code: "VALIDATION_FAILED",
      };
    }

    const result = await upsertSection(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      if (result.code === "VERSION_CONFLICT") {
        return {
          ok: false,
          error: "Section changed elsewhere; reloading.",
          code: result.code,
          currentVersion: result.currentVersion,
        };
      }
      return {
        ok: false,
        error: result.message ?? "Save failed",
        code: result.code,
      };
    }
    return {
      ok: true,
      version: result.data.version,
      visibility: input.visibility,
    };
  } catch (error) {
    logServerError("edit-mode/set-section-visibility", error);
    return { ok: false, error: "Save failed" };
  }
}
