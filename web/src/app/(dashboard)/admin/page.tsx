import Link from "next/link";
import { ArrowRight, Images, Languages, LayoutDashboard, LayoutList, UserRound } from "lucide-react";
import { translationsHref } from "@/app/(dashboard)/admin/translations/translations-url";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ADMIN_PAGE_STACK, ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { Button } from "@/components/ui/button";
import { DashboardEmptyState } from "@/components/dashboard/dashboard-empty-state";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { loadAdminOverviewData, loadAdminTranslationHealth } from "@/lib/dashboard/admin-dashboard-data";
import { cn } from "@/lib/utils";

export default async function AdminDashboardPage() {
  const [overview, translationHealth] = await Promise.all([
    loadAdminOverviewData(),
    loadAdminTranslationHealth(),
  ]);

  const th = translationHealth ?? {
    profilesMissingSpanish: 0,
    profilesStale: 0,
    profilesDraftPending: 0,
    taxonomyMissingSpanish: 0,
    locationsMissingSpanish: 0,
  };
  const translationAttentionTotal =
    th.profilesMissingSpanish +
    th.profilesStale +
    th.profilesDraftPending +
    th.taxonomyMissingSpanish +
    th.locationsMissingSpanish;

  const overviewLinks = [
    {
      href: "/admin/talent?status=under_review",
      title: "Talent needing review",
      description: "Jump straight into submitted and under-review profiles.",
      meta: `${overview?.counts.pendingTalent ?? 0} pending`,
      icon: <LayoutList className="size-4" aria-hidden />,
    },
    {
      href: "/admin/media",
      title: "Pending media",
      description: "Approve uploads before they appear in approved portfolios.",
      meta: `${overview?.counts.pendingMedia ?? 0} uploads`,
      icon: <Images className="size-4" aria-hidden />,
    },
    {
      href: "/admin/clients",
      title: "Clients",
      description: "Portal login users — not billing entities (see Work Locations).",
      meta: `${overview?.counts.totalClients ?? 0} profiles`,
      icon: <UserRound className="size-4" aria-hidden />,
    },
  ];

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={LayoutDashboard}
        title="Agency overview"
        description="Control center for inquiries, talent operations, and merchandising."
      />

      {translationAttentionTotal > 0 ? (
        <div
          className="flex flex-col gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/[0.08] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
          role="status"
        >
          <div className="flex min-w-0 items-start gap-3">
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-200 ring-1 ring-amber-500/30">
              <Languages className="size-4" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Translations need attention</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {translationAttentionTotal} open item{translationAttentionTotal === 1 ? "" : "s"} across bios,
                taxonomy, and locations.
              </p>
            </div>
          </div>
          <Button asChild size="sm" className="shrink-0 rounded-xl">
            <Link href="/admin/translations" scroll={false}>
              Open translations
              <ArrowRight className="ml-1 size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      ) : null}

      <section aria-labelledby="translation-health-heading">
        <h2
          id="translation-health-heading"
          className="mb-4 font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground"
        >
          Translation health
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {(
            [
              {
                title: "Bios missing ES",
                count: th.profilesMissingSpanish,
                href: translationsHref({ view: "bio", status: "missing" }),
                description: "Talent profiles with no Spanish bio.",
              },
              {
                title: "Bios stale",
                count: th.profilesStale,
                href: translationsHref({ view: "bio", status: "stale" }),
                description: "English changed after Spanish was published.",
              },
              {
                title: "Draft pending",
                count: th.profilesDraftPending,
                href: translationsHref({ view: "bio", status: "draft" }),
                description: "Unpublished Spanish drafts waiting in the hub.",
              },
              {
                title: "Taxonomy gaps",
                count: th.taxonomyMissingSpanish,
                href: translationsHref({ view: "taxonomy", status: "needs_attention" }),
                description: "Terms without Spanish labels.",
              },
              {
                title: "Location gaps",
                count: th.locationsMissingSpanish,
                href: translationsHref({ view: "locations", status: "needs_attention" }),
                description: "Cities without Spanish display names.",
              },
            ] as const
          ).map((card) => (
            <Link
              key={card.title}
              href={card.href}
              scroll={false}
              className={cn(
                "group flex flex-col rounded-2xl border border-border/60 bg-muted/10 p-4 shadow-sm outline-none transition-all duration-200",
                "hover:border-[var(--impronta-gold-border)]/55 hover:bg-[var(--impronta-gold)]/[0.03] hover:shadow-md",
                "focus-visible:border-[var(--impronta-gold-border)] focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/35",
              )}
            >
              <p className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {card.title}
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">{card.count}</p>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{card.description}</p>
              <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground group-hover:text-foreground">
                Open in hub
                <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </p>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Control center
        </h2>
        <div className="grid gap-4 lg:grid-cols-3">
          {overviewLinks.map((item) => (
            <DashboardSectionCard
              key={item.href}
              title={item.title}
              description={item.description}
              titleClassName={ADMIN_SECTION_TITLE_CLASS}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex size-9 items-center justify-center rounded-xl bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/20">
                    {item.icon}
                  </span>
                  <span className="font-medium text-foreground">{item.meta}</span>
                </div>
                <Button size="sm" variant="outline" className="rounded-xl border-border/70" asChild>
                  <Link href={item.href} scroll={false}>
                    Open
                    <ArrowRight className="ml-1 size-4" aria-hidden />
                  </Link>
                </Button>
              </div>
            </DashboardSectionCard>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-4 font-display text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Recent activity
        </h2>
        {overview && overview.recentActivity.length > 0 ? (
          <DashboardSectionCard
            title="Recent activity"
            description="Latest operational changes across inquiries, talent, and media."
            titleClassName={ADMIN_SECTION_TITLE_CLASS}
          >
            <ul className="space-y-3">
              {overview.recentActivity.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-muted/10 px-4 py-3 transition-colors hover:border-[var(--impronta-gold-border)]/40"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{item.detail}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {item.type}
                    </span>
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-foreground">
                      {item.status.replace(/_/g, " ")}
                    </span>
                    <Button size="sm" variant="outline" asChild>
                      <Link href={item.href} scroll={false}>
                        Open
                      </Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </DashboardSectionCard>
        ) : (
          <DashboardEmptyState
            title="No recent activity yet"
            description="New profiles, inquiry updates, and media submissions will appear here."
          />
        )}
      </section>
    </div>
  );
}
