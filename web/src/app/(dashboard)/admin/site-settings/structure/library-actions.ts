"use server";

/**
 * Section Library — "quick create" server action.
 *
 * Picking a type in the library gallery calls this action. It creates a
 * draft `cms_sections` row with sensible defaults (via `getLibraryDefault`)
 * and returns the new id + metadata. The caller (homepage composer) adds
 * the new id to its in-memory slot state; the composer's existing Save
 * Draft flow persists that slot assignment with the usual CAS guard.
 *
 * We intentionally do NOT touch `cms_page_sections` here — the assignment
 * travels through `saveHomepageDraftComposition` like every other slot
 * mutation. Keeps concurrency discipline in one place.
 *
 * Collision handling: section names are unique per tenant. If the default
 * name ("Hero — new") is already taken, we append a short random token
 * and retry once. Admins can rename afterward.
 */

import { randomBytes } from "node:crypto";

import { sectionUpsertSchema } from "@/lib/site-admin/forms/sections";
import {
  getSectionType,
  type SectionTypeKey,
  SECTION_REGISTRY,
} from "@/lib/site-admin/sections/registry";
import { getLibraryDefault } from "@/lib/site-admin/sections/shared/default-content";
import { upsertSection } from "@/lib/site-admin/server/sections";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";

export type LibraryActionState =
  | {
      ok: true;
      section: {
        id: string;
        name: string;
        sectionTypeKey: SectionTypeKey;
        version: number;
        status: "draft";
      };
    }
  | { ok: false; error: string; code?: string }
  | undefined;

function single(formData: FormData, name: string): string {
  const v = formData.get(name);
  return typeof v === "string" ? v : "";
}

function shortToken(): string {
  return randomBytes(3).toString("hex");
}

function isUniqueNameViolation(code?: string, message?: string): boolean {
  // cms_sections_tenant_name_key — surfaced by upsertSection as a Phase5
  // failure mapped from the Postgres 23505 unique_violation. The server op
  // uses code UNIQUE_VIOLATION or NAME_TAKEN depending on the map path —
  // guard both.
  if (code === "UNIQUE_VIOLATION" || code === "NAME_TAKEN") return true;
  return Boolean(message && /already exists|duplicate key|unique/i.test(message));
}

export async function quickCreateSectionFromLibraryAction(
  _prev: LibraryActionState,
  formData: FormData,
): Promise<LibraryActionState> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before adding a section.",
    };
  }

  const typeKey = single(formData, "sectionTypeKey");
  if (!(typeKey in SECTION_REGISTRY)) {
    return {
      ok: false,
      error: `Unknown section type "${typeKey}".`,
      code: "UNKNOWN_SECTION_TYPE",
    };
  }
  const key = typeKey as SectionTypeKey;
  const entry = getSectionType(key);
  if (!entry) {
    return {
      ok: false,
      error: "Section type is not registered on this platform build.",
      code: "UNKNOWN_SECTION_TYPE",
    };
  }

  const defaults = getLibraryDefault(key);

  // Build the upsert payload. validateSectionProps runs inside upsertSection,
  // so if our defaults drift from the current schema, the error surfaces
  // with a precise Zod path and we fix the default — never ship a broken
  // schema/default pair.
  const baseValues = {
    tenantId: scope.tenantId,
    sectionTypeKey: key,
    schemaVersion: entry.currentVersion,
    props: defaults.props,
    expectedVersion: 0 as const,
  };

  // Two attempts: clean name first, then suffixed fallback on uniqueness
  // collision. Beyond two attempts the tenant has ~65k same-typed sections
  // and the problem is not name collision.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const name =
      attempt === 0 ? defaults.name : `${defaults.name} ${shortToken()}`;
    const parsed = sectionUpsertSchema.safeParse({ ...baseValues, name });
    if (!parsed.success) {
      logServerError(
        "library-actions/safeParse",
        new Error(
          parsed.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        ),
      );
      return {
        ok: false,
        error: "Section defaults failed validation — reach out to support.",
        code: "VALIDATION_FAILED",
      };
    }

    try {
      const result = await upsertSection(auth.supabase, {
        tenantId: scope.tenantId,
        values: parsed.data,
        actorProfileId: auth.user.id,
      });
      if (result.ok) {
        return {
          ok: true,
          section: {
            id: result.data.id,
            name,
            sectionTypeKey: key,
            version: result.data.version,
            status: "draft",
          },
        };
      }
      if (isUniqueNameViolation(result.code, result.message) && attempt === 0) {
        // Loop one more time with a short token appended.
        continue;
      }
      if (result.code === "FORBIDDEN") {
        return {
          ok: false,
          error: "Not authorized to create sections for this workspace.",
          code: result.code,
        };
      }
      return {
        ok: false,
        error: result.message ?? CLIENT_ERROR.update,
        code: result.code,
      };
    } catch (error) {
      logServerError("library-actions/upsertSection", error);
      if (error instanceof Error && /forbidden/i.test(error.message)) {
        return {
          ok: false,
          error: "Not authorized to create sections.",
          code: "FORBIDDEN",
        };
      }
      return { ok: false, error: CLIENT_ERROR.update };
    }
  }

  return {
    ok: false,
    error:
      "Couldn't create the section — a conflict kept happening on the default name. Try again in a moment.",
    code: "NAME_TAKEN",
  };
}
