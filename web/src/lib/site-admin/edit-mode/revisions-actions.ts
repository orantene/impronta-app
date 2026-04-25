"use server";

/**
 * Edit-chrome revisions actions — typed wrappers over the existing
 * `loadHomepageRevisionsForStaff` read and `restoreHomepageRevision` write.
 *
 * The composer route at `/admin/site-settings/structure/actions.ts` exposes
 * a FormData-shaped restore action for its `useActionState` form. The
 * edit chrome's RevisionsDrawer needs a typed payload + typed return so
 * the React-state-driven UI doesn't have to round-trip through FormData.
 *
 * Both actions delegate to the same lib-layer ops so capability /
 * tenant-scope / CAS / audit / revision / cache-bust discipline is
 * identical to the composer path. No business logic is duplicated here.
 */

import {
  homepageRestoreRevisionSchema,
} from "@/lib/site-admin/forms/homepage";
import { restoreHomepageRevision } from "@/lib/site-admin/server/homepage";
import {
  loadDraftHomepage,
  loadHomepageRevisionsForStaff,
} from "@/lib/site-admin/server/homepage-reads";
import { isLocale, type Locale } from "@/lib/site-admin/locales";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { logServerError } from "@/lib/server/safe-error";

// ── types ─────────────────────────────────────────────────────────────────

/**
 * Shape the drawer renders per row. `kind` is the same enum the lib layer
 * persists; we expose it raw so the UI can colour the badge. `sectionCount`
 * is lifted from `snapshot.composition` so a row can carry "12 sections"
 * without the drawer having to deserialize the full snapshot.
 *
 * `createdBy` carries the actor's `display_name` joined from `profiles`.
 * Older revisions written before profiles existed (or by deleted users)
 * fall through to `null` — the UI renders "—" in that case.
 */
export interface RevisionListRow {
  id: string;
  kind: "draft" | "published" | "rollback";
  version: number;
  createdAt: string;
  createdBy: { id: string; displayName: string | null } | null;
  sectionCount: number;
  /** `snapshot.page.title` if present — useful when the row predates the current title. */
  titleAtRevision: string | null;
}

export type RevisionsLoadResult =
  | {
      ok: true;
      revisions: RevisionListRow[];
      pageVersion: number;
      /** Version the most recent `kind='published'` revision was minted at. */
      publishedVersion: number | null;
    }
  | { ok: false; error: string; code?: string };

export type RevisionRestoreResult =
  | { ok: true; pageVersion: number }
  | { ok: false; error: string; code?: string; currentVersion?: number };

// ── locale helper ─────────────────────────────────────────────────────────

function asLocale(raw: string): Locale | null {
  return isLocale(raw) ? raw : null;
}

// ── load ───────────────────────────────────────────────────────────────────

/**
 * List the homepage's saved revisions, newest-first. Capped at 50 entries —
 * older revisions are still preserved in the table; the drawer just doesn't
 * surface them. If we ever surface paging the parameter belongs here.
 *
 * `pageVersion` is returned alongside so the caller has a fresh CAS guard
 * to feed into `restoreHomepageRevisionAction` without a separate round-
 * trip — the drawer opens, fetches once, and that single payload is
 * everything it needs.
 */
export async function loadHomepageRevisionsAction(input: {
  locale: string;
}): Promise<RevisionsLoadResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "Select an agency workspace before viewing revisions." };
  }
  const locale = asLocale(input.locale);
  if (!locale) {
    return { ok: false, error: `Unsupported locale "${input.locale}".` };
  }

  try {
    const page = await loadDraftHomepage(scope.tenantId, locale);
    if (!page) {
      return {
        ok: false,
        error: "Homepage not seeded for this locale.",
        code: "NOT_FOUND",
      };
    }

    const rows = await loadHomepageRevisionsForStaff(
      auth.supabase,
      scope.tenantId,
      page.pageId,
      50,
    );

    // Bulk-fetch profile display names for non-null actor ids so we don't
    // do N round-trips. A revision with `created_by=null` (legacy or RPC-
    // initiated write) just renders without an author chip.
    const actorIds = Array.from(
      new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v)),
    );
    const profileMap = new Map<string, { id: string; displayName: string | null }>();
    if (actorIds.length > 0) {
      const { data: profiles } = await auth.supabase
        .from("profiles")
        .select("id, display_name")
        .in("id", actorIds);
      for (const p of (profiles ?? []) as Array<{
        id: string;
        display_name: string | null;
      }>) {
        profileMap.set(p.id, { id: p.id, displayName: p.display_name });
      }
    }

    let publishedVersion: number | null = null;
    const revisions: RevisionListRow[] = rows.map((r) => {
      if (r.kind === "published" && publishedVersion === null) {
        publishedVersion = r.version;
      }
      const snap = (r.snapshot ?? {}) as {
        composition?: unknown[];
        page?: { title?: string };
      };
      return {
        id: r.id,
        kind: r.kind,
        version: r.version,
        createdAt: r.created_at,
        createdBy: r.created_by ? profileMap.get(r.created_by) ?? {
          id: r.created_by,
          displayName: null,
        } : null,
        sectionCount: Array.isArray(snap.composition)
          ? snap.composition.length
          : 0,
        titleAtRevision: snap.page?.title ?? null,
      };
    });

    return {
      ok: true,
      revisions,
      pageVersion: page.version,
      publishedVersion,
    };
  } catch (error) {
    logServerError("edit-mode/load-revisions", error);
    return { ok: false, error: "Failed to load revisions" };
  }
}

// ── restore ────────────────────────────────────────────────────────────────

/**
 * Roll the homepage draft back to a saved revision. The lib op writes a new
 * draft composition + bumps `cms_pages.version`, then mints a fresh
 * `kind='rollback'` revision row so the audit trail captures the action.
 * Nothing is published — the operator reviews the restored draft and
 * presses Publish when ready (same rhythm as the composer's restore button).
 *
 * On `VERSION_CONFLICT` the caller should refetch composition + revisions
 * and re-prompt; we return the server's authoritative `currentVersion` so
 * the UI can surface the staleness without a second round-trip.
 */
export async function restoreHomepageRevisionAction(input: {
  revisionId: string;
  locale: string;
  expectedVersion: number;
}): Promise<RevisionRestoreResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before restoring a revision.",
    };
  }

  const parsed = homepageRestoreRevisionSchema.safeParse({
    tenantId: scope.tenantId,
    locale: input.locale,
    revisionId: input.revisionId,
    expectedVersion: input.expectedVersion,
  });
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid restore request.",
      code: "VALIDATION_FAILED",
    };
  }

  try {
    const result = await restoreHomepageRevision(auth.supabase, {
      tenantId: scope.tenantId,
      values: parsed.data,
      actorProfileId: auth.user.id,
    });
    if (!result.ok) {
      if (result.code === "VERSION_CONFLICT") {
        return {
          ok: false,
          error: "Page changed elsewhere; reload and try again.",
          code: result.code,
          currentVersion: result.currentVersion,
        };
      }
      return {
        ok: false,
        error: result.message ?? "Restore failed",
        code: result.code,
      };
    }
    return { ok: true, pageVersion: result.data.version };
  } catch (error) {
    logServerError("edit-mode/restore-revision", error);
    return { ok: false, error: "Restore failed" };
  }
}
