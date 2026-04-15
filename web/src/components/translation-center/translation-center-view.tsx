import Link from "next/link";
import { Download, FileText, Languages } from "lucide-react";

import {
  BIO_STATUS_FILTERS,
  TAX_LOC_STATUS_FILTERS,
  translationsHref,
  type BioFilterKey,
  type TaxLocFilterKey,
  VIEW_TABS,
} from "@/app/(dashboard)/admin/translations/translations-url";
import { TranslationCenterQueue } from "@/components/translation-center/translation-center-queue";
import { AdminCollapsibleSection } from "@/components/admin/admin-collapsible-section";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { AdminPageTabs } from "@/components/admin/admin-page-tabs";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ADMIN_FORM_CONTROL,
  ADMIN_PAGE_WIDTH,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import type { TranslationCenterBootstrap, TranslationUnitDTO } from "@/lib/translation-center/types";
import type { BioSortKey, LocationSortKey, SortDir, TaxonomySortKey } from "@/app/(dashboard)/admin/translations/translations-url";
import { cn } from "@/lib/utils";

function SummaryCard({
  label,
  count,
  href,
  active,
  tone,
}: {
  label: string;
  count: number;
  href: string;
  active: boolean;
  tone: "red" | "orange" | "amber" | "green" | "slate" | "violet";
}) {
  const ring =
    tone === "red"
      ? "border-red-500/35 hover:border-red-500/55"
      : tone === "orange"
        ? "border-orange-500/35 hover:border-orange-500/55"
        : tone === "amber"
          ? "border-amber-500/35 hover:border-amber-500/55"
          : tone === "green"
            ? "border-emerald-500/35 hover:border-emerald-500/55"
            : tone === "violet"
              ? "border-violet-500/35 hover:border-violet-500/55"
              : "border-border/60 hover:border-border";

  return (
    <Link
      href={href}
      className={cn(
        "flex min-w-[8.5rem] flex-1 flex-col rounded-xl border bg-card/50 px-3 py-3 shadow-sm transition-all duration-200",
        ring,
        "hover:bg-card/80 hover:shadow-md",
        active ? "ring-2 ring-primary/45 shadow-md" : "",
      )}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">{count}</span>
    </Link>
  );
}

export function TranslationCenterView({
  bootstrap,
  units,
  hasMore,
  loadError,
  view,
  bioStatusFilter,
  taxLocStatusFilter,
  q,
  bioSort,
  taxonomySort,
  locationSort,
  sortDir,
  aiConfigured,
}: {
  bootstrap: TranslationCenterBootstrap;
  units: TranslationUnitDTO[];
  hasMore: boolean;
  loadError: string | null;
  view: string;
  bioStatusFilter: BioFilterKey;
  taxLocStatusFilter: TaxLocFilterKey;
  q: string;
  bioSort: BioSortKey;
  taxonomySort: TaxonomySortKey;
  locationSort: LocationSortKey;
  sortDir: SortDir;
  aiConfigured: boolean;
}) {
  const tab = bootstrap.tabRollups[view] ?? {
    missing: 0,
    complete: 0,
    needs_attention: 0,
    language_issue: 0,
    applicableRequired: 0,
    filledRequired: 0,
  };

  const firstMissingBio = units.find((u) => u.domainId === "talent.profile.bio" && u.health === "missing");
  const openNextMissingBioHref = firstMissingBio
    ? `/admin/talent/${firstMissingBio.entityId}#bio-translation`
    : null;

  const statusForHref = view === "bio" ? bioStatusFilter : taxLocStatusFilter;

  return (
    <div className={`${ADMIN_PAGE_WIDTH} space-y-6 pb-8`}>
      <AdminPageHeader
        icon={Languages}
        title="Translations"
        description="Registry-driven Translation Center — coverage, queues, and editing across domains."
      />

      <p className="text-xs text-muted-foreground">
        Active languages (admin):{" "}
        <span className="font-mono text-foreground/90">{bootstrap.languageSettings.adminLocales.join(", ")}</span>
        {" · "}
        Inventory v{bootstrap.languageSettings.translationInventoryVersion}
        {" · "}
        <Link href="/admin/settings/languages" className="underline underline-offset-2 hover:text-foreground">
          Language settings
        </Link>
      </p>

      <AdminCollapsibleSection
        title="Translation tools"
        description="AI status for this hub. Row actions use OpenAI when configured."
        toggleLabelShow="Show tools"
        toggleLabelHide="Hide tools"
      >
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-border/50 bg-gradient-to-br from-[var(--impronta-gold)]/[0.06] to-transparent px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
            <div className="min-w-0 space-y-1">
              <p className="text-sm font-medium text-foreground">OpenAI</p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {aiConfigured
                  ? "Configured — AI-assisted fills are available from talent profile pages and other admin tools."
                  : "Set OPENAI_API_KEY on the server to enable AI-assisted fills."}
              </p>
            </div>
            <Badge
              variant={aiConfigured ? "default" : "secondary"}
              className="h-8 w-fit shrink-0 rounded-full px-3.5 text-[11px] font-semibold uppercase tracking-wide"
            >
              {aiConfigured ? "Available" : "Unavailable"}
            </Badge>
          </div>
        </div>
      </AdminCollapsibleSection>

      <AdminPageTabs
        ariaLabel="Translation workspace"
        items={VIEW_TABS.map((tabItem) => ({
          href: translationsHref({
            view: tabItem.key,
            status: tabItem.key === "bio" ? bioStatusFilter : taxLocStatusFilter,
            q,
            sort:
              tabItem.key === "bio"
                ? bioSort
                : tabItem.key === "taxonomy"
                  ? taxonomySort
                  : tabItem.key === "locations"
                    ? locationSort
                    : undefined,
            dir: sortDir,
          }),
          label: tabItem.label,
          active: view === tabItem.key,
        }))}
      />

      <DashboardSectionCard
        title="This tab — translation health"
        description="Aggregates all domains in this tab from the Translation Center registry."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
        right={
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
            <Button asChild variant="outline" size="sm" className="h-9 gap-1.5 rounded-full text-xs shadow-sm">
              <a href="/api/admin/translations/export" download>
                <Download className="size-3.5" aria-hidden />
                Export gaps
              </a>
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap gap-2">
          <SummaryCard
            label="Missing"
            count={tab.missing}
            href={translationsHref({
              view,
              status: "missing",
              q,
              sort: view === "taxonomy" ? taxonomySort : view === "locations" ? locationSort : bioSort,
              dir: sortDir,
            })}
            active={statusForHref === "missing"}
            tone="red"
          />
          <SummaryCard
            label="Needs attention"
            count={tab.needs_attention}
            href={translationsHref({
              view,
              status: "needs_attention",
              q,
              sort:
                view === "taxonomy"
                  ? taxonomySort
                  : view === "locations"
                    ? locationSort
                    : view === "cms"
                      ? "slug"
                      : view === "messages" || view === "profile_fields"
                        ? "name"
                        : bioSort,
              dir: sortDir,
            })}
            active={statusForHref === "needs_attention"}
            tone="orange"
          />
          <SummaryCard
            label="Complete"
            count={tab.complete}
            href={translationsHref({
              view,
              status: "complete",
              q,
              sort:
                view === "taxonomy"
                  ? taxonomySort
                  : view === "locations"
                    ? locationSort
                    : view === "cms"
                      ? "slug"
                      : view === "messages" || view === "profile_fields"
                        ? "name"
                        : bioSort,
              dir: sortDir,
            })}
            active={statusForHref === "complete"}
            tone="green"
          />
          <SummaryCard
            label="Language issue"
            count={tab.language_issue}
            href={translationsHref({
              view,
              status: "language_issue",
              q,
              sort:
                view === "taxonomy"
                  ? taxonomySort
                  : view === "locations"
                    ? locationSort
                    : bioSort,
              dir: sortDir,
            })}
            active={statusForHref === "language_issue"}
            tone="violet"
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Global strict coverage:{" "}
          <span className="font-mono font-medium text-foreground">
            {bootstrap.global.strictCoveragePercent ?? "—"}%
          </span>{" "}
          ({bootstrap.global.filledRequired}/{bootstrap.global.applicableRequired} required units filled)
        </p>
      </DashboardSectionCard>

      <DashboardSectionCard
        title="Work queue"
        description="Filter and search. Edit opens an inline sheet; full-page links stay available for deep context."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            {(view === "bio" ? BIO_STATUS_FILTERS : TAX_LOC_STATUS_FILTERS).map((f) => (
              <Button
                key={f.key}
                asChild
                variant={statusForHref === f.key ? "secondary" : "outline"}
                size="sm"
                className="h-8 gap-1.5 rounded-full border-border/60 px-3 text-xs"
              >
                <Link
                  href={translationsHref({
                    view,
                    status: f.key,
                    q,
                    sort:
                      view === "taxonomy"
                        ? taxonomySort
                        : view === "locations"
                          ? locationSort
                          : bioSort,
                    dir: sortDir,
                  })}
                >
                  {f.label}
                </Link>
              </Button>
            ))}
          </div>
          <form className="flex max-w-md flex-col gap-2" action="/admin/translations" method="get">
            <input type="hidden" name="view" value={view} />
            {statusForHref !== "all" ? <input type="hidden" name="status" value={statusForHref} /> : null}
            {view === "bio" && bioSort !== "name" ? <input type="hidden" name="sort" value={bioSort} /> : null}
            {view === "taxonomy" && taxonomySort !== "kind" ? (
              <input type="hidden" name="sort" value={taxonomySort} />
            ) : null}
            {view === "locations" && locationSort !== "country" ? (
              <input type="hidden" name="sort" value={locationSort} />
            ) : null}
            {view === "cms" || view === "messages" || view === "profile_fields" ? (
              <input type="hidden" name="sort" value="name" />
            ) : null}
            {sortDir !== "asc" ? <input type="hidden" name="dir" value={sortDir} /> : null}
            <label className="text-xs font-medium text-muted-foreground">
              Search
              <Input name="q" defaultValue={q} placeholder="Filter…" className={cn("mt-1", ADMIN_FORM_CONTROL)} />
            </label>
            <Button type="submit" size="sm" variant="secondary" className="w-fit rounded-lg">
              Search
            </Button>
          </form>
        </div>
      </DashboardSectionCard>

      {view === "bio" && openNextMissingBioHref ? (
        <div className="flex justify-end">
          <Button asChild size="sm" variant="outline" className="rounded-full">
            <Link href={openNextMissingBioHref}>Open next missing bio</Link>
          </Button>
        </div>
      ) : null}

      {loadError ? (
        <p className="text-sm text-destructive">{loadError}</p>
      ) : units.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/50 bg-muted/10 px-6 py-14 text-center shadow-sm">
          <FileText className="size-10 text-muted-foreground/45" aria-hidden />
          <p className="font-medium text-foreground">No rows</p>
          <p className="max-w-md text-sm text-muted-foreground">Try another filter or clear search.</p>
        </div>
      ) : (
        <TranslationCenterQueue units={units} />
      )}

      {hasMore ? (
        <p className="text-xs text-muted-foreground">More rows exist — refine filters or raise the v1 per-page cap.</p>
      ) : null}
    </div>
  );
}
