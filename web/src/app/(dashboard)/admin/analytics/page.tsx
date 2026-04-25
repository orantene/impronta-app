import Link from "next/link";
import { redirect } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Compass,
  Filter,
  Search,
  Sparkles,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AnalyticsHonestyLabel } from "@/components/admin/analytics-honesty-label";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import {
  ADMIN_PAGE_STACK,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import {
  formatYmd,
  loadExecutiveOverviewInternal,
  rangeFromKey,
} from "@/lib/analytics/admin-data";
import {
  fetchGa4ChannelSessions,
  fetchGa4LandingPages,
} from "@/lib/server/ga4-reporting";
import { requireStaff } from "@/lib/server/action-guards";

export const dynamic = "force-dynamic";

/**
 * Phase 17 — Analytics consolidation.
 *
 * /admin/analytics is now the real landing page (was a redirect to
 * /overview). It renders the executive KPIs + GA4 source mix inline,
 * plus a card grid that deep-links to the specialised dashboards
 * (acquisition, funnels, search, SEO, talent). The deep pages still
 * exist as their own routes — they're heavy data fetches and don't
 * belong inline — but the index gives one operator-grade landing.
 */

type DeepLink = {
  href: string;
  icon: LucideIcon;
  title: string;
  blurb: string;
};

const DEEP_LINKS: DeepLink[] = [
  {
    href: "/admin/analytics/acquisition",
    icon: Compass,
    title: "Acquisition",
    blurb: "Channels, devices, countries, landing pages — GA4.",
  },
  {
    href: "/admin/analytics/funnels",
    icon: Filter,
    title: "Funnels",
    blurb: "Inquiry → booking conversion stages, drop-off rates.",
  },
  {
    href: "/admin/analytics/search",
    icon: Search,
    title: "Search",
    blurb: "Internal search queries, no-result rate, refinements.",
  },
  {
    href: "/admin/analytics/seo",
    icon: Sparkles,
    title: "SEO",
    blurb: "Search Console impressions, clicks, CTR, top queries.",
  },
  {
    href: "/admin/analytics/talent",
    icon: Users,
    title: "Talent performance",
    blurb: "Profile view distribution, top performers, dormant roster.",
  },
];

export default async function AdminAnalyticsPage() {
  const auth = await requireStaff();
  if (!auth.ok) redirect("/login");

  const range = rangeFromKey("30d");
  const internal = await loadExecutiveOverviewInternal(range);
  if (!internal) redirect("/login");

  const start = formatYmd(range.start);
  const end = formatYmd(range.end);
  const [channels, landings] = await Promise.all([
    fetchGa4ChannelSessions(start, end),
    fetchGa4LandingPages(start, end),
  ]);

  const approvalRatioPct =
    internal.talentApproved + internal.talentPendingReview > 0
      ? Math.round(
          (internal.talentApproved /
            (internal.talentApproved + internal.talentPendingReview)) *
            100,
        )
      : 0;

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={BarChart3}
        title="Analytics"
        description="Executive overview up top, deep dashboards in the cards below — every analytics surface, one landing page."
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Range: <span className="text-foreground">{range.label}</span> ({start} → {end})
        </p>
        <AnalyticsHonestyLabel variant="internal">Internal exact</AnalyticsHonestyLabel>
      </div>

      <section aria-labelledby="exec-kpis">
        <h2 id="exec-kpis" className="sr-only">
          Executive KPIs
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <DashboardSectionCard
            title="Inquiries (period)"
            description="Supabase"
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
              {internal.inquiriesPeriod}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {internal.inquiriesTotal} all-time
            </p>
          </DashboardSectionCard>
          <DashboardSectionCard
            title="Open inquiries"
            description="Pipeline"
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
              {internal.openInquiries}
            </p>
          </DashboardSectionCard>
          <DashboardSectionCard
            title="Approved talent"
            description="Directory"
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
              {internal.talentApproved}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {internal.talentPendingReview} in review
            </p>
          </DashboardSectionCard>
          <DashboardSectionCard
            title="Client profiles"
            description="Portal"
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
              {internal.clientProfiles}
            </p>
          </DashboardSectionCard>
          <DashboardSectionCard
            title="Profile views (events)"
            description="Instrumented"
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
              {internal.profileViewEventsPeriod}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              From <code className="text-[11px]">view_talent_profile</code> internal events
            </p>
          </DashboardSectionCard>
          <DashboardSectionCard
            title="Product events (period)"
            description="Internal"
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
              {internal.analyticsEventsPeriod}
            </p>
          </DashboardSectionCard>
          <DashboardSectionCard
            title="Talent approval ratio"
            description="Approximate"
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <p className="font-display text-3xl font-semibold tabular-nums text-foreground">
              {approvalRatioPct}%
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              approved vs in review + approved
            </p>
          </DashboardSectionCard>
        </div>
      </section>

      <section
        className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        aria-label="Attention"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-foreground">
            <AlertTriangle className="size-4" aria-hidden />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-medium text-foreground">Needs attention</p>
            <p className="mt-0.5 text-muted-foreground">
              {internal.talentPendingReview > 0 ? (
                <>
                  {internal.talentPendingReview} talent profile
                  {internal.talentPendingReview === 1 ? "" : "s"} awaiting review.{" "}
                  <Link
                    href="/admin/talent?status=under_review"
                    className="text-foreground underline-offset-2 hover:underline"
                  >
                    Open queue
                  </Link>
                </>
              ) : (
                "No pending talent in submitted / under-review states."
              )}
            </p>
          </div>
        </div>
      </section>

      <section aria-labelledby="ga-source" className="grid gap-6 lg:grid-cols-2">
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2
              id="ga-source"
              className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
            >
              Source mix (GA4)
            </h2>
            <AnalyticsHonestyLabel variant="ga4">GA4 · cached</AnalyticsHonestyLabel>
          </div>
          {channels.error ? (
            <p className="text-sm text-muted-foreground">{channels.error}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {channels.rows.slice(0, 8).map((row) => (
                <li
                  key={row.channel}
                  className="flex justify-between gap-4 border-b border-border/40 py-1.5 last:border-0"
                >
                  <span className="text-muted-foreground">{row.channel}</span>
                  <span className="tabular-nums text-foreground">{row.sessions}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Top landing pages (GA4)
            </h2>
            <AnalyticsHonestyLabel variant="ga4">GA4 · cached</AnalyticsHonestyLabel>
          </div>
          {landings.error ? (
            <p className="text-sm text-muted-foreground">{landings.error}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {landings.rows.slice(0, 8).map((row) => (
                <li
                  key={row.page}
                  className="flex justify-between gap-4 border-b border-border/40 py-1.5 last:border-0"
                >
                  <span
                    className="min-w-0 truncate text-muted-foreground"
                    title={row.page}
                  >
                    {row.page}
                  </span>
                  <span className="shrink-0 tabular-nums text-foreground">
                    {row.views}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="deep-dashboards" className="space-y-3">
        <h2
          id="deep-dashboards"
          className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
        >
          Deep dashboards
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEEP_LINKS.map(({ href, icon: Icon, title, blurb }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-start gap-3 rounded-2xl border border-border/60 bg-card/40 p-4 shadow-sm transition-[border-color,background-color,box-shadow] duration-200 hover:border-foreground/40 hover:bg-muted/30 hover:shadow-md"
            >
              <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl border border-border/60 bg-muted/40 text-foreground">
                <Icon className="size-4" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{blurb}</p>
              </div>
              <ChevronRight
                className="mt-1 size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
                aria-hidden
              />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
