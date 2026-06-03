"use server";

/**
 * Edit-chrome revisions actions — typed wrappers over the existing
 * `loadHomepageRevisionsForStaff` read and `restoreHomepageRevision` write,
 * plus a generalised path for any `cms_page` (not just the homepage).
 *
 * T4.5 (P4-REVISIONS): generalise revision reads to every cms_page and add
 * a snapshot-load action so the diff view can compare any two revisions.
 * The homepage path is kept byte-stable — non-homepage pages use the
 * `loadPageRevisionsAction` + `restorePageRevisionAction` pair, which
 * delegate to the same lib-layer ops used by the composer.
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
import { pageRestoreRevisionSchema } from "@/lib/site-admin/forms/pages";
import { restoreHomepageRevision } from "@/lib/site-admin/server/homepage";
import { restorePageRevision } from "@/lib/site-admin/server/pages";
import {
  loadDraftHomepage,
  loadHomepageRevisionsForStaff,
} from "@/lib/site-admin/server/homepage-reads";
import { loadPageRevisionsForStaff } from "@/lib/site-admin/server/pages-reads";
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

// ── Generalised (non-homepage) page revisions ─────────────────────────────

/**
 * Snapshot summary used by the diff view. Carries the top-level section/node
 * list extracted from the revision's snapshot JSONB so the UI can show a
 * human-readable diff without deserialising the full builder tree.
 */
export interface RevisionSnapshotSummary {
  revisionId: string;
  kind: "draft" | "published" | "rollback";
  version: number;
  createdAt: string;
  /** Page title recorded in the snapshot. */
  title: string | null;
  /**
   * Ordered list of top-level section/block labels extracted from the
   * snapshot. For section-slot snapshots this is the `name` field on each
   * composition entry. For builder-tree snapshots it is the label/id of
   * each root node. Used to render the side-by-side diff rows.
   */
  items: Array<{ id: string; label: string; kind: string }>;
}

export type RevisionSnapshotResult =
  | { ok: true; a: RevisionSnapshotSummary; b: RevisionSnapshotSummary }
  | { ok: false; error: string };

// ── Helper: extract summary items from a raw snapshot JSONB ────────────────

function extractSnapshotItems(
  snap: Record<string, unknown>,
): Array<{ id: string; label: string; kind: string }> {
  // Prefer the builder tree root nodes (freeform pages).
  const builderTree = snap.builderTree;
  if (Array.isArray(builderTree) && builderTree.length > 0) {
    return builderTree
      .slice(0, 60)
      .map((node: unknown, i: number) => {
        if (node && typeof node === "object") {
          const n = node as Record<string, unknown>;
          return {
            id: typeof n.id === "string" ? n.id : String(i),
            label:
              typeof n.label === "string" && n.label
                ? n.label
                : typeof n.kind === "string"
                  ? n.kind
                  : `block ${i + 1}`,
            kind: typeof n.kind === "string" ? n.kind : "block",
          };
        }
        return { id: String(i), label: `block ${i + 1}`, kind: "block" };
      });
  }
  // Fall back to section-slot composition list.
  const composition = snap.composition;
  if (Array.isArray(composition)) {
    return composition
      .slice(0, 60)
      .map((entry: unknown, i: number) => {
        if (entry && typeof entry === "object") {
          const e = entry as Record<string, unknown>;
          return {
            id: typeof e.sectionId === "string" ? e.sectionId : String(i),
            label:
              typeof e.name === "string" && e.name
                ? e.name
                : typeof e.sectionTypeKey === "string"
                  ? e.sectionTypeKey
                  : `section ${i + 1}`,
            kind: typeof e.sectionTypeKey === "string" ? e.sectionTypeKey : "section",
          };
        }
        return { id: String(i), label: `section ${i + 1}`, kind: "section" };
      });
  }
  return [];
}

// ── Helper: build profile map for a set of actor ids ───────────────────────

async function fetchProfileMap(
  supabase: Parameters<typeof loadPageRevisionsForStaff>[0],
  actorIds: string[],
): Promise<Map<string, { id: string; displayName: string | null }>> {
  const profileMap = new Map<string, { id: string; displayName: string | null }>();
  if (actorIds.length === 0) return profileMap;
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", actorIds);
  for (const p of (profiles ?? []) as Array<{
    id: string;
    display_name: string | null;
  }>) {
    profileMap.set(p.id, { id: p.id, displayName: p.display_name });
  }
  return profileMap;
}

/**
 * Load revision history for ANY cms_page by its id. Replaces the
 * homepage-only `loadHomepageRevisionsAction` for non-homepage pages.
 * The return shape is identical so the drawer can use it without a switch.
 *
 * The homepage path stays separate (`loadHomepageRevisionsAction`) so the
 * locale-lookup logic remains unchanged; this new path accepts a direct
 * `pageId` and `pageVersion`.
 */
export async function loadPageRevisionsAction(input: {
  pageId: string;
  pageVersion: number;
}): Promise<RevisionsLoadResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "Select an agency workspace before viewing revisions." };
  }

  try {
    const rows = await loadPageRevisionsForStaff(
      auth.supabase,
      scope.tenantId,
      input.pageId,
      50,
    );

    const actorIds = Array.from(
      new Set(rows.map((r) => r.created_by).filter((v): v is string => !!v)),
    );
    const profileMap = await fetchProfileMap(auth.supabase, actorIds);

    let publishedVersion: number | null = null;
    const revisions: RevisionListRow[] = rows.map((r) => {
      if (r.kind === "published" && publishedVersion === null) {
        publishedVersion = r.version;
      }
      const snap = (r.snapshot ?? {}) as {
        composition?: unknown[];
        builderTree?: unknown[];
        page?: { title?: string };
        title?: string;
      };
      const title =
        typeof snap.title === "string" ? snap.title
        : snap.page && typeof snap.page.title === "string" ? snap.page.title
        : null;
      const nodeCount = Array.isArray(snap.builderTree)
        ? snap.builderTree.length
        : Array.isArray(snap.composition)
          ? snap.composition.length
          : 0;
      return {
        id: r.id,
        kind: r.kind,
        version: r.version,
        createdAt: r.created_at,
        createdBy: r.created_by ? profileMap.get(r.created_by) ?? {
          id: r.created_by,
          displayName: null,
        } : null,
        sectionCount: nodeCount,
        titleAtRevision: title,
      };
    });

    return {
      ok: true,
      revisions,
      pageVersion: input.pageVersion,
      publishedVersion,
    };
  } catch (error) {
    logServerError("edit-mode/load-page-revisions", error);
    return { ok: false, error: "Failed to load revisions" };
  }
}

/**
 * Roll any non-homepage page's draft back to a saved revision. Mirrors
 * `restoreHomepageRevisionAction` but delegates to `restorePageRevision`
 * (the M3 pages module) and requires `pageId` instead of a locale lookup.
 *
 * On VERSION_CONFLICT the caller should refetch composition + revisions and
 * re-prompt; we return `currentVersion` so the UI can surface the staleness.
 */
export async function restorePageRevisionAction(input: {
  revisionId: string;
  pageId: string;
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

  const parsed = pageRestoreRevisionSchema.safeParse({
    pageId: input.pageId,
    tenantId: scope.tenantId,
    revisionId: input.revisionId,
    expectedVersion: input.expectedVersion,
  });
  if (!parsed.success) {
    return { ok: false, error: "Invalid restore request.", code: "VALIDATION_FAILED" };
  }

  try {
    const result = await restorePageRevision(auth.supabase, {
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
    logServerError("edit-mode/restore-page-revision", error);
    return { ok: false, error: "Restore failed" };
  }
}

/**
 * Load the snapshot summaries for two revisions so the diff panel can render
 * a side-by-side structural comparison. Accepts a pair of revision ids; both
 * must belong to the same tenant and page (enforced by the query filters).
 *
 * Returns lightweight item lists rather than the full snapshot JSONB so the
 * drawer payload stays small. The full snapshot round-trip is only needed for
 * an actual restore, not for viewing the diff.
 */
export async function loadRevisionDiffAction(input: {
  pageId: string;
  revisionIdA: string;
  revisionIdB: string;
}): Promise<RevisionSnapshotResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace first." };

  try {
    const ids = [input.revisionIdA, input.revisionIdB];
    const { data: rows, error } = await auth.supabase
      .from("cms_page_revisions")
      .select("id, kind, version, created_at, snapshot")
      .eq("tenant_id", scope.tenantId)
      .eq("page_id", input.pageId)
      .in("id", ids);

    if (error) return { ok: false, error: "Failed to load revision snapshots." };

    const rowMap = new Map<string, typeof rows[number]>(
      ((rows ?? []) as typeof rows).map((r) => [r.id as string, r]),
    );
    const rowA = rowMap.get(input.revisionIdA);
    const rowB = rowMap.get(input.revisionIdB);
    if (!rowA || !rowB) {
      return { ok: false, error: "One or both revisions not found for this page." };
    }

    function toSummary(
      row: NonNullable<typeof rowA>,
    ): RevisionSnapshotSummary {
      const snap = (row.snapshot ?? {}) as Record<string, unknown>;
      const title =
        typeof snap.title === "string" ? snap.title
        : snap.page && typeof snap.page === "object" && "title" in snap.page
          ? (snap.page as Record<string, unknown>).title as string | null
          : null;
      return {
        revisionId: row.id as string,
        kind: row.kind as RevisionSnapshotSummary["kind"],
        version: row.version as number,
        createdAt: row.created_at as string,
        title: title ?? null,
        items: extractSnapshotItems(snap),
      };
    }

    return { ok: true, a: toSummary(rowA), b: toSummary(rowB) };
  } catch (error) {
    logServerError("edit-mode/diff-revisions", error);
    return { ok: false, error: "Failed to load diff." };
  }
}
