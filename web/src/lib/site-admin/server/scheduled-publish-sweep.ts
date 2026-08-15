/**
 * Scheduled-publish sweep — page-kind classification + dispatch loop.
 *
 * PURE + INJECTABLE on purpose. The cron route at
 * `/api/cron/publish-scheduled` owns the Supabase wiring; this module owns
 * the decisions (is the row due? which publish path does it take? when is the
 * schedule cleared?) so those decisions can be unit-tested without a database,
 * a session, or the Next.js server graph.
 *
 * WHY THIS EXISTS: the original sweep hard-filtered
 * `system_template_key = 'homepage'`, while the editor's Publish caret offers
 * "Schedule publish" on EVERY surface. Scheduling an inner page therefore
 * never fired. There are three publish paths in this codebase and a due row
 * must take the right one — deleting the filter alone would have pushed
 * freeform cms pages through the homepage publisher, which reads
 * `cms_page_sections` and would have published an empty slot composition.
 *
 *   homepage  → slot-composed system page   → publishHomepage()
 *   freeform  → BuilderNode tree in blocks  → publishCmsFreeformPageWithClient()
 *   template  → legacy slot/template page   → publishPage()
 */

/** Which publish path a due `cms_pages` row belongs to. */
export type ScheduledPageKind = "homepage" | "freeform" | "template";

/** The `cms_pages` shape the sweep needs. Matches SCHEDULED_SWEEP_COLUMNS. */
export interface ScheduledPageRow {
  id: string;
  tenant_id: string;
  locale: string | null;
  version: number;
  status: string;
  scheduled_publish_at: string | null;
  scheduled_by: string | null;
  is_system_owned: boolean;
  system_template_key: string | null;
  is_freeform: boolean;
}

/** Column list the cron route selects. Kept here so the sweep's row type and
 *  the query can never drift apart. */
export const SCHEDULED_SWEEP_COLUMNS =
  "id, tenant_id, locale, version, status, scheduled_publish_at, scheduled_by, is_system_owned, system_template_key, is_freeform";

/**
 * Route a row to its publish path.
 *
 * The homepage test is the system-template key, NOT the slug (the homepage
 * slug is the empty string on some tenants) and NOT `is_freeform` alone (a
 * mis-flagged system row must still publish through the homepage path).
 * `is_freeform` is checked second so a freeform page can never be mistaken for
 * a legacy template page.
 */
export function classifyScheduledPage(
  row: Pick<
    ScheduledPageRow,
    "is_system_owned" | "system_template_key" | "is_freeform"
  >,
): ScheduledPageKind {
  if (row.is_system_owned && row.system_template_key === "homepage") {
    return "homepage";
  }
  if (row.is_freeform) return "freeform";
  return "template";
}

/**
 * Defensive due-check, re-asserted inside the sweep so a loader bug (or a
 * hand-run of the route against a wider query) can never publish a page ahead
 * of its time.
 *
 * `archived` is excluded: an archived page with a stale schedule must not be
 * resurrected by the cron. Every other status is publishable — the schedule
 * column IS the operator's intent, and gating on `status='draft'` (the old
 * behaviour) meant a freeform page that was already published once could never
 * fire a later schedule, because publishing never flips its status back.
 */
export function isRowDue(row: ScheduledPageRow, nowIso: string): boolean {
  if (!row.scheduled_publish_at) return false;
  if (row.status === "archived") return false;
  const fireAt = Date.parse(row.scheduled_publish_at);
  const now = Date.parse(nowIso);
  if (Number.isNaN(fireAt) || Number.isNaN(now)) return false;
  return fireAt <= now;
}

export type PublishOutcome =
  | { ok: true; version: number; publishedAt: string }
  | { ok: false; error: string };

export type ScheduledPublishHandlers = Record<
  ScheduledPageKind,
  (row: ScheduledPageRow, locale: string) => Promise<PublishOutcome>
>;

export interface PublishedRowReport {
  pageId: string;
  locale: string;
  kind: ScheduledPageKind;
  version: number;
  publishedAt: string;
}

export interface FailedRowReport {
  pageId: string;
  locale: string | null;
  kind: ScheduledPageKind | null;
  error: string;
}

export interface SweepReport {
  sweptAt: string;
  dueCount: number;
  skippedCount: number;
  publishedCount: number;
  failedCount: number;
  published: PublishedRowReport[];
  failed: FailedRowReport[];
}

export interface SweepDeps {
  /** ISO timestamp the sweep runs at. Injected so tests are deterministic. */
  nowIso: string;
  /** Candidate rows from `cms_pages`. May over-select; `isRowDue` re-filters. */
  rows: ScheduledPageRow[];
  /** Per-kind publish path. */
  handlers: ScheduledPublishHandlers;
  /** Locale validator — a row with an unusable locale is reported, not published. */
  isLocale: (value: string) => boolean;
  /** Clear the schedule columns. Only called after a SUCCESSFUL publish. */
  clearSchedule: (row: ScheduledPageRow) => Promise<void>;
}

/**
 * Publish every due row through its own path.
 *
 * Idempotency: the schedule columns are cleared only after a successful
 * publish, so a failure leaves the schedule intact and the next sweep retries.
 * The publish paths themselves are CAS-guarded, so a duplicate run against a
 * stale version is rejected at the DB layer rather than double-publishing.
 */
export async function runScheduledPublishSweep(
  deps: SweepDeps,
): Promise<SweepReport> {
  const published: PublishedRowReport[] = [];
  const failed: FailedRowReport[] = [];
  let dueCount = 0;
  let skippedCount = 0;

  for (const row of deps.rows) {
    if (!isRowDue(row, deps.nowIso)) {
      skippedCount += 1;
      continue;
    }
    dueCount += 1;

    if (!row.locale || !deps.isLocale(row.locale)) {
      failed.push({
        pageId: row.id,
        locale: row.locale,
        kind: null,
        error: `Invalid locale "${row.locale ?? "<null>"}"`,
      });
      continue;
    }

    const kind = classifyScheduledPage(row);
    let outcome: PublishOutcome;
    try {
      outcome = await deps.handlers[kind](row, row.locale);
    } catch (err) {
      outcome = {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }

    if (!outcome.ok) {
      failed.push({
        pageId: row.id,
        locale: row.locale,
        kind,
        error: outcome.error,
      });
      continue;
    }

    await deps.clearSchedule(row);

    published.push({
      pageId: row.id,
      locale: row.locale,
      kind,
      version: outcome.version,
      publishedAt: outcome.publishedAt,
    });
  }

  return {
    sweptAt: deps.nowIso,
    dueCount,
    skippedCount,
    publishedCount: published.length,
    failedCount: failed.length,
    published,
    failed,
  };
}
