/**
 * W45 — Projects, the list.
 *
 * A REAL ROUTE AS OF P4. Until now `projects` was declared in the destination
 * registry with `built: false` and a fallback onto Messages, so a URL for a
 * project landed on the thread it would have been about. The registry entry is
 * flipped with this page and not before it.
 *
 * Server Component, canonical route, same shape as the Orders desk. The
 * capability gate is `view_dashboard`: a project is operational work, and the
 * coordinator who runs one is not necessarily the person who can see billing.
 *
 * WHAT IS NOT LISTED. Every paid order mints one `agency_bookings` shell so a
 * transaction has a booking to point at. Those are counter sales, and listing
 * them here would bury the commissions under the day's coffees. The predicate
 * is `isOrderShellBooking` in `lib/projects/project-record.ts`.
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { loadProjects } from "@/lib/projects/projects-reader";
import {
  commonTimeZone,
  filterProjectRows,
  projectListRow,
  zonedDate,
  type ProjectListFilter,
} from "@/lib/projects/project-record";
import { Card, Chip, Notice, PageHeading, PageShell } from "./_shared";
import { ACTION_KEY, STATUS_KEY } from "./_keys";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type PageSearch = Promise<{ filter?: string }>;

const FILTERS: readonly ProjectListFilter[] = [
  "all",
  "open",
  "awaiting_approval",
  "owed",
  "closed",
];

/** Full literal keys, for the same reason `_keys.ts` spells its keys out. */
const FILTER_KEY: Record<ProjectListFilter, string> = {
  all: "dashboard.projects.filterAll",
  open: "dashboard.projects.filterOpen",
  awaiting_approval: "dashboard.projects.filterAwaiting",
  owed: "dashboard.projects.filterOwed",
  closed: "dashboard.projects.filterClosed",
};

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
  const filter: ProjectListFilter = FILTERS.includes(sp.filter as ProjectListFilter)
    ? (sp.filter as ProjectListFilter)
    : "all";

  const load = await loadProjects(scope.tenantId);

  return (
    <PageShell>
      <PageHeading
        title={tr("dashboard.projects.pageTitle")}
        intro={tr("dashboard.projects.pageIntro")}
      />

      {!load.ok ? (
        // A read error is not an empty desk. It says so.
        <Notice tone="warn">{tr("dashboard.projects.unavailable")}</Notice>
      ) : (
        <ProjectsTable
          rows={filterProjectRows(load.projects.map(projectListRow), filter)}
          total={load.projects.length}
          filter={filter}
          tenantSlug={tenantSlug}
          tr={tr}
        />
      )}
    </PageShell>
  );
}

function ProjectsTable({
  rows,
  total,
  filter,
  tenantSlug,
  tr,
}: {
  rows: ReturnType<typeof projectListRow>[];
  total: number;
  filter: ProjectListFilter;
  tenantSlug: string;
  tr: (key: string) => string;
}) {
  // Which clock these dates are on. One zone gets one sentence under the table;
  // several get named on each row, because a single note would be wrong.
  const oneZone = commonTimeZone(rows.map((r) => r.timeZone));
  return (
    <>
      <nav
        aria-label={tr("dashboard.projects.pageTitle")}
        className="mb-5 flex flex-wrap items-center gap-2"
      >
        {FILTERS.map((f) => (
          <Link
            key={f}
            href={f === "all" ? "?" : `?filter=${f}`}
            aria-current={f === filter ? "page" : undefined}
            className="no-underline"
          >
            <Chip active={f === filter}>{tr(FILTER_KEY[f])}</Chip>
          </Link>
        ))}
        <span className="text-xs text-muted-foreground">
          {interpolate(tr("dashboard.projects.count"), { count: rows.length })}
        </span>
      </nav>

      {total === 0 ? (
        <Card>
          <p className="m-0 text-sm text-foreground">{tr("dashboard.projects.empty")}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            {tr("dashboard.projects.emptyHint")}
          </p>
        </Card>
      ) : rows.length === 0 ? (
        // A filter that matched nothing is a different sentence from a
        // workspace with no projects at all.
        <Notice>{tr("dashboard.projects.empty")}</Notice>
      ) : (
        <div className="w-full overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full caption-bottom border-collapse text-sm">
            <caption className="sr-only">{tr("dashboard.projects.tableCaption")}</caption>
            <thead className="[&_th]:border-b [&_th]:border-border [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
              <tr>
                <th scope="col">{tr("dashboard.projects.colProject")}</th>
                <th scope="col">{tr("dashboard.projects.colClient")}</th>
                <th scope="col">{tr("dashboard.projects.colStarts")}</th>
                <th scope="col">{tr("dashboard.projects.colTeam")}</th>
                <th scope="col">{tr("dashboard.projects.colDue")}</th>
                <th scope="col">{tr("dashboard.projects.colNext")}</th>
              </tr>
            </thead>
            <tbody className="[&_td]:border-b [&_td]:border-border/60 [&_td]:px-4 [&_td]:py-3 [&_tr:last-child_td]:border-0">
              {rows.map((row) => (
                <tr key={row.id}>
                  <th scope="row" className="px-4 py-3 text-left font-normal">
                    <Link
                      href={`/${tenantSlug}/admin/projects/${row.id}`}
                      className="font-medium text-foreground underline underline-offset-4"
                    >
                      {row.title || row.id.slice(0, 8)}
                    </Link>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {tr(STATUS_KEY[row.status])}
                    </span>
                  </th>
                  <td className="text-foreground">
                    {/* The client record's door from this surface. It opens
                        only when a customer row exists, because that record is
                        what `orders.customer_id` points at; a project nobody
                        has paid for yet has no customer to open. */}
                    {row.customerId && row.clientName ? (
                      <Link
                        href={`/${tenantSlug}/admin/clients/${row.customerId}`}
                        className="text-foreground underline underline-offset-4"
                      >
                        {row.clientName}
                      </Link>
                    ) : (
                      (row.clientName ?? (
                        <span className="text-muted-foreground">
                          {tr("dashboard.projects.noClient")}
                        </span>
                      ))
                    )}
                  </td>
                  <td className="text-muted-foreground">
                    {zonedDate(row.startsAt, row.timeZone, tr("dashboard.projects.noDate"))}
                    {/* When the visible rows span more than one clock there is
                        no single zone to name at the bottom, so each row names
                        its own. Same rule the mixed-currency totals follow. */}
                    {oneZone === null ? (
                      <span className="mt-1 block text-xs">{row.timeZone}</span>
                    ) : null}
                  </td>
                  <td className="text-muted-foreground">{row.assignmentCount}</td>
                  <td className="text-foreground">
                    {formatOrderMoney(row.dueCents, row.currency)}
                  </td>
                  <td className="text-muted-foreground">{tr(ACTION_KEY[row.action])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 0 ? (
        <p className="mt-3 text-xs text-muted-foreground">
          {oneZone === null
            ? tr("dashboard.projects.timezoneMixed")
            : interpolate(tr("dashboard.projects.timezoneNote"), { zone: oneZone })}
        </p>
      ) : null}
    </>
  );
}
