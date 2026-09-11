/**
 * W45 — Projects, the list, as the board draws it: title and intro, `From
 * inquiry or offer` and `New project`, the segmented filter (Active · Needs
 * action · Overdue · Drafts · Closed) with the Owner / Status / Deadline
 * chips and the search box, then one card of rows: Project · Client · Owner
 * · Status · Next deadline · Due now · Remaining.
 *
 * Server Component, canonical route. The capability gate is `view_dashboard`:
 * a project is operational work, and the coordinator who runs one is not
 * necessarily the person who can see billing.
 *
 * EVERY JUDGEMENT IS THE RECORD'S. Which pill a row wears, its next deadline,
 * what is owed and what remains all come from `lib/projects/project-record`
 * (`projectListRow`, given the one clock this page read), never from a
 * column this file worked out.
 *
 * WHAT IS NOT LISTED. Every paid order mints one `agency_bookings` shell so a
 * transaction has a booking to point at. Those are counter sales, and listing
 * them here would bury the commissions under the day's coffees. The predicate
 * is `isOrderShellBooking` in `lib/projects/project-record.ts`.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { MoreHorizontal, Plus } from "lucide-react";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { requestNowMs } from "@/lib/projects/request-clock";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { loadProjects } from "@/lib/projects/projects-reader";
import {
  filterProjectRows,
  projectListRow,
  type ProjectListFilter,
  type ProjectListRow,
  type ProjectStatus,
} from "@/lib/projects/project-record";
import { utcToZonedYmd } from "@/lib/scheduling/tz";
import {
  BTN_PRIMARY,
  BTN_SECONDARY,
  Card,
  ListHead,
  ListRow,
  Notice,
  PageHeading,
  PageShell,
  Pill,
  SegmentLink,
  Segments,
  dayLabel,
  shortId,
} from "./_shared";
import { STATUS_KEY } from "./_keys";
import { ListControls } from "./list-controls";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type PageSearch = Promise<{ filter?: string; status?: string; deadline?: string; q?: string }>;

/** The board's five segments, in its order. `open` is "Active". */
const SEGMENTS: readonly ProjectListFilter[] = ["open", "needs_action", "overdue", "drafts", "closed"];

const FILTERS: readonly ProjectListFilter[] = [
  "all",
  "open",
  "awaiting_approval",
  "owed",
  "closed",
  "needs_action",
  "overdue",
  "drafts",
];

/** Full literal keys, for the same reason `_keys.ts` spells its keys out. */
const FILTER_KEY: Record<ProjectListFilter, string> = {
  all: "dashboard.projects.filterAll",
  open: "dashboard.projects.filterActive",
  awaiting_approval: "dashboard.projects.filterAwaiting",
  owed: "dashboard.projects.filterOwed",
  closed: "dashboard.projects.filterClosed",
  needs_action: "dashboard.projects.filterNeedsAction",
  overdue: "dashboard.projects.filterOverdue",
  drafts: "dashboard.projects.filterDrafts",
};

const STATUSES: readonly ProjectStatus[] = [
  "draft",
  "tentative",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "archived",
];

const COLS = "grid-cols-[1.6fr_1.1fr_90px_150px_150px_100px_110px_24px]";

type Tr = (key: string) => string;

function normalise(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

export default async function AdminProjectsPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: PageSearch;
}) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("view_dashboard", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const sp = await searchParams;
  const filter = FILTERS.find((f) => f === sp.filter) ?? "open";
  const status = STATUSES.find((s) => s === sp.status) ?? "any";
  const deadline = sp.deadline === "this_month" || sp.deadline === "overdue" ? sp.deadline : "any";
  const query = typeof sp.q === "string" ? sp.q.trim() : "";

  // ONE clock for the whole page, read once. Every "overdue" below is
  // judged against this instant, never against `Date.now()` in a loop.
  const nowMs = requestNowMs();
  const load = await loadProjects(scope.tenantId);
  const base = `/${tenantSlug}/admin`;

  const actions = (
    <>
      <Link href={`${base}/messages`} className={BTN_SECONDARY}>
        {tr("dashboard.projects.fromInquiry")}
      </Link>
      {/* A project is minted by "Create booking" on an accepted offer; there
          is no writer for a blank project (D-POS-35), so the board's button
          is drawn disabled with the reason. */}
      <button type="button" disabled title={tr("dashboard.projects.newProjectUnavailable")} className={BTN_PRIMARY}>
        <Plus aria-hidden size={14} strokeWidth={1.75} />
        {tr("dashboard.projects.newProject")}
      </button>
    </>
  );

  if (!load.ok) {
    return (
      <PageShell>
        <PageHeading title={tr("dashboard.projects.pageTitle")} intro={tr("dashboard.projects.pageIntro")} actions={actions} />
        {/* A read error is not an empty desk. It says so. */}
        <Notice tone="warn">{tr("dashboard.projects.unavailable")}</Notice>
      </PageShell>
    );
  }

  const allRows = load.projects.map((p) => projectListRow(p, nowMs));
  const segmentRows = filterProjectRows(allRows, filter);
  const needle = normalise(query);
  const rows = segmentRows
    .filter((r) => status === "any" || r.status === status)
    .filter((r) => matchesDeadline(r, deadline, nowMs))
    .filter(
      (r) =>
        !needle ||
        normalise(r.title).includes(needle) ||
        normalise(r.clientName ?? "").includes(needle) ||
        r.id.startsWith(needle),
    );

  const segmentHref = (f: ProjectListFilter) => {
    const params = new URLSearchParams();
    if (f !== "open") params.set("filter", f);
    if (status !== "any") params.set("status", status);
    if (deadline !== "any") params.set("deadline", deadline);
    if (query) params.set("q", query);
    const qs = params.toString();
    return qs ? `?${qs}` : "?";
  };

  return (
    <PageShell>
      <PageHeading title={tr("dashboard.projects.pageTitle")} intro={tr("dashboard.projects.pageIntro")} actions={actions} />

      <div className="flex flex-wrap items-center gap-2">
        <Segments label={tr("dashboard.projects.pageTitle")}>
          {SEGMENTS.map((f) => {
            const count = filterProjectRows(allRows, f).length;
            return (
              <SegmentLink key={f} href={segmentHref(f)} active={f === filter}>
                {f === "closed" ? tr(FILTER_KEY[f]) : `${tr(FILTER_KEY[f])} · ${count}`}
              </SegmentLink>
            );
          })}
        </Segments>
        <span className="flex-1" />
        <ListControls
          filter={filter}
          status={status}
          deadline={deadline}
          query={query}
          copy={{
            owner: tr("dashboard.projects.filterOwner"),
            ownerUnavailable: tr("dashboard.projects.filterOwnerUnavailable"),
            status: tr("dashboard.projects.filterStatus"),
            statusAny: tr("dashboard.projects.filterAny"),
            statuses: STATUSES.map((s) => ({ id: s, label: tr(STATUS_KEY[s]) })),
            deadline: tr("dashboard.projects.filterDeadline"),
            deadlineAny: tr("dashboard.projects.filterAny"),
            deadlineThisMonth: tr("dashboard.projects.filterThisMonth"),
            deadlineOverdue: tr("dashboard.projects.filterOverdue"),
            search: tr("dashboard.projects.searchPlaceholder"),
          }}
        />
      </div>

      {load.projects.length === 0 ? (
        <Card padded>
          <p className="m-0 text-[13px] text-admin-ink">{tr("dashboard.projects.empty")}</p>
          <p className="m-0 mt-1.5 text-[13px] text-admin-ink-muted">{tr("dashboard.projects.emptyHint")}</p>
        </Card>
      ) : rows.length === 0 ? (
        // A filter that matched nothing is a different sentence from a
        // workspace with no projects at all.
        <Notice>{tr("dashboard.projects.emptyFiltered")}</Notice>
      ) : (
        <ProjectsTable rows={rows} tenantSlug={tenantSlug} locale={locale} nowMs={nowMs} tr={tr} />
      )}
    </PageShell>
  );
}

function matchesDeadline(row: ProjectListRow, deadline: string, nowMs: number): boolean {
  if (deadline === "overdue") return row.overdueDays !== null;
  if (deadline === "this_month") {
    if (!row.nextDeadline) return false;
    const at = utcToZonedYmd(new Date(row.nextDeadline.at), row.timeZone);
    const now = utcToZonedYmd(new Date(nowMs), row.timeZone);
    return at !== null && now !== null && at.slice(0, 7) === now.slice(0, 7);
  }
  return true;
}

function ProjectsTable({
  rows,
  tenantSlug,
  locale,
  nowMs,
  tr,
}: {
  rows: ProjectListRow[];
  tenantSlug: string;
  locale: string;
  nowMs: number;
  tr: Tr;
}) {
  const noDate = tr("dashboard.projects.noDate");
  return (
    <Card>
      <ListHead cols={COLS}>
        <span>{tr("dashboard.projects.colProject")}</span>
        <span>{tr("dashboard.projects.colClient")}</span>
        <span>{tr("dashboard.projects.colOwner")}</span>
        <span>{tr("dashboard.projects.colStatus")}</span>
        <span>{tr("dashboard.projects.colNextDeadline")}</span>
        <span>{tr("dashboard.projects.colDueNow")}</span>
        <span>{tr("dashboard.projects.colRemaining")}</span>
        <span />
      </ListHead>
      <ul className="m-0 list-none p-0" aria-label={tr("dashboard.projects.tableCaption")}>
        {rows.map((row) => (
          <li key={row.id}>
            <ListRow cols={COLS} className="border-t">
              <span className="min-w-0 truncate font-semibold">
                <Link href={`/${tenantSlug}/admin/projects/${row.id}`} className="text-admin-ink no-underline hover:underline">
                  {row.title || shortId(row.id)}
                </Link>
                <span className="font-normal text-admin-ink-muted"> · {shortId(row.id)}</span>
              </span>
              <span className="min-w-0 truncate">
                {/* The client record's door from this surface. It opens
                    only when a customer row exists, because that record is
                    what `orders.customer_id` points at; a project nobody
                    has paid for yet has no customer to open. */}
                {row.customerId && row.clientName ? (
                  <Link href={`/${tenantSlug}/admin/clients/${row.customerId}`} className="text-admin-ink no-underline hover:underline">
                    {row.clientName}
                  </Link>
                ) : (
                  (row.clientName ?? <span className="text-admin-ink-muted">{tr("dashboard.projects.noClient")}</span>)
                )}
              </span>
              {/* No owner is recorded on a project (D-POS-35). */}
              <span className="text-admin-ink-dim" title={tr("dashboard.projects.filterOwnerUnavailable")}>
                —
              </span>
              <span>
                <StatusPill row={row} tr={tr} />
              </span>
              <span className="min-w-0 truncate text-admin-ink-muted">
                {row.nextDeadline
                  ? `${row.nextDeadline.title} · ${dayLabel(row.nextDeadline.at, row.timeZone, locale, noDate)}`
                  : dayLabel(row.startsAt, row.timeZone, locale, noDate)}
              </span>
              <span className={row.dueCents > 0 ? "font-semibold tabular-nums" : "tabular-nums"}>
                {row.dueCents > 0 || row.hasAcceptedAgreement ? formatOrderMoney(row.dueCents, row.currency) : "—"}
              </span>
              <span className="tabular-nums text-admin-ink-muted">
                {row.remainingCents === null
                  ? row.status === "completed" || row.status === "cancelled" || row.status === "archived"
                    ? "—"
                    : tr("dashboard.projects.openEnded")
                  : formatOrderMoney(row.remainingCents, row.currency)}
              </span>
              <Link
                href={`/${tenantSlug}/admin/projects/${row.id}`}
                aria-label={interpolate(tr("dashboard.projects.openProject"), { title: row.title || shortId(row.id) })}
                className="inline-flex h-6 w-6 items-center justify-center rounded-md text-admin-ink-dim hover:bg-admin-surface-alt hover:text-admin-ink"
              >
                <MoreHorizontal aria-hidden size={13} strokeWidth={1.75} />
              </Link>
            </ListRow>
          </li>
        ))}
      </ul>
      {/* Which clock these dates are on. */}
      <p className="m-0 border-t border-admin-border-soft px-4 py-2 text-[11.5px] text-admin-ink-muted">
        {tr("dashboard.projects.timezoneEach")}
        {" · "}
        {interpolate(tr("dashboard.projects.count"), { count: rows.length })}
        <span className="sr-only">{new Date(nowMs).toISOString()}</span>
      </p>
    </Card>
  );
}

function StatusPill({ row, tr }: { row: ProjectListRow; tr: Tr }) {
  const badge = row.badge;
  if (badge.kind === "awaiting_approval") return <Pill tone="coral">{tr("dashboard.projects.badgeAwaitingApproval")}</Pill>;
  if (badge.kind === "overdue") {
    return <Pill tone="red">{interpolate(tr("dashboard.projects.badgeOverdue"), { days: badge.days })}</Pill>;
  }
  if (badge.kind === "offer_sent") {
    return <Pill tone="slate">{interpolate(tr("dashboard.projects.badgeOfferSent"), { n: badge.version })}</Pill>;
  }
  const tone =
    badge.status === "in_progress"
      ? "indigo"
      : badge.status === "confirmed" || badge.status === "completed"
        ? "green"
        : badge.status === "cancelled"
          ? "red"
          : "slate";
  return <Pill tone={tone}>{tr(STATUS_KEY[badge.status])}</Pill>;
}
