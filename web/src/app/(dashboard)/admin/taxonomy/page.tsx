import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { getCachedServerSupabase } from "@/lib/server/request-cache";
import { CreateTermForm } from "./taxonomy-forms";
import { TaxonomyKindPanel, type AdminTaxonomyTerm } from "./taxonomy-kind-panel";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Info, Tags } from "lucide-react";
import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  ADMIN_FORM_CONTROL,
  ADMIN_GROUP_LIST_GAP,
  ADMIN_HELP_TRIGGER_BUTTON,
  ADMIN_LINK_PILL,
  ADMIN_PAGE_STACK,
  ADMIN_POPOVER_CONTENT_CLASS,
  ADMIN_SECTION_TITLE_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { isMissingTaxonomyPromoColumnsError } from "@/lib/taxonomy/taxonomy-promo";

type Term = {
  id: string;
  kind: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  sort_order: number;
  archived_at: string | null;
  promo_image_storage_path: string | null;
  promo_placements: string[] | null;
};

const GROUP_LABELS: Record<string, string> = {
  talent_type: "Talent Types",
  tag: "Tags",
  skill: "Skills",
  industry: "Industries",
  event_type: "Event Types",
  fit_label: "Fit Labels",
  language: "Languages",
  location_country: "Location countries (synced)",
  location_city: "Location cities (synced)",
};

const GROUP_ORDER = [
  "talent_type",
  "tag",
  "skill",
  "industry",
  "event_type",
  "fit_label",
  "language",
  "location_country",
  "location_city",
];

const SYSTEM_MANAGED_KINDS = new Set(["location_country", "location_city"]);

/** Taxonomy kinds staff manage manually (excludes location mirrors). */
const USER_MANAGED_KIND_ORDER = GROUP_ORDER.filter((k) => !SYSTEM_MANAGED_KINDS.has(k));

const KNOWN_USER_KIND_SET = new Set(USER_MANAGED_KIND_ORDER);

function sortTermsStable(terms: Term[]): Term[] {
  return [...terms].sort(
    (a, b) => a.sort_order - b.sort_order || a.slug.localeCompare(b.slug) || a.name_en.localeCompare(b.name_en),
  );
}

/** Derived from `public.locations`; same order as GROUP_ORDER tail. */
const LOCATION_KIND_ORDER = ["location_country", "location_city"] as const;

export default async function AdminTaxonomyPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string; q?: string }>;
}) {
  const { show, q: qParam } = await searchParams;
  const showArchived = show === "archived";
  const filterQ = (qParam ?? "").trim();

  const supabase = await getCachedServerSupabase();

  if (!supabase) {
    return (
      <p className="text-sm text-muted-foreground">Supabase not configured.</p>
    );
  }

  const runList = (select: string) => {
    let q = supabase
      .from("taxonomy_terms")
      .select(select)
      .order("kind")
      .order("sort_order")
      .order("slug");
    if (!showArchived) {
      q = q.is("archived_at", null);
    }
    if (filterQ) {
      const escaped = filterQ.replace(/[%_]/g, "\\$&");
      q = q.or(`name_en.ilike.%${escaped}%,slug.ilike.%${escaped}%`);
    }
    return q;
  };

  const selectWithPromo =
    "id, kind, slug, name_en, name_es, sort_order, archived_at, promo_image_storage_path, promo_placements";
  const selectLegacy = "id, kind, slug, name_en, name_es, sort_order, archived_at";

  let res = await runList(selectWithPromo);
  let terms: Term[];

  if (!res.error) {
    terms = (res.data ?? []).map((row) => {
      const t = row as unknown as Term;
      return {
        ...t,
        promo_image_storage_path: t.promo_image_storage_path ?? null,
        promo_placements: t.promo_placements ?? [],
      };
    });
  } else if (isMissingTaxonomyPromoColumnsError(res.error)) {
    const retry = await runList(selectLegacy);
    if (retry.error) {
      logServerError("admin/taxonomy/list", retry.error);
      return (
        <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>
      );
    }
    terms = (retry.data ?? []).map((row) => ({
      ...(row as unknown as Omit<Term, "promo_image_storage_path" | "promo_placements">),
      promo_image_storage_path: null,
      promo_placements: [] as string[],
    }));
  } else {
    logServerError("admin/taxonomy/list", res.error);
    return (
      <p className="text-sm text-destructive">{CLIENT_ERROR.loadPage}</p>
    );
  }

  // Group by kind (query order is kind → sort_order → slug; reduce preserves that order per kind)
  const grouped = ((terms ?? []) as Term[]).reduce<Record<string, Term[]>>(
    (acc, term) => {
      if (!acc[term.kind]) acc[term.kind] = [];
      acc[term.kind].push(term);
      return acc;
    },
    {},
  );

  const list = (terms ?? []) as Term[];
  const kindsPresent = [...new Set(list.map((t) => t.kind))].filter((k) => !SYSTEM_MANAGED_KINDS.has(k));
  const extraKinds = kindsPresent
    .filter((k) => !KNOWN_USER_KIND_SET.has(k))
    .sort((a, b) => a.localeCompare(b));
  const userKindsWithTerms = [
    ...USER_MANAGED_KIND_ORDER.filter((k) => (grouped[k]?.length ?? 0) > 0),
    ...extraKinds.filter((k) => (grouped[k]?.length ?? 0) > 0),
  ];
  const noTermsAtAll = list.length === 0;
  const aiTaxonomyImageEnabled = Boolean(process.env.OPENAI_API_KEY?.trim());

  return (
    <div className={ADMIN_PAGE_STACK}>
      <AdminPageHeader
        icon={Tags}
        title="Taxonomy"
        description={
          <>
            Controlled vocabulary for tags, skills, and filters. Profile location is not edited here — use{" "}
            <Link href="/admin/locations" className="font-medium text-[var(--impronta-gold)] underline underline-offset-4">
              Locations
            </Link>{" "}
            plus each talent’s profile.
          </>
        }
        right={
          <div className="flex flex-col items-end gap-2">
            <Popover>
              <PopoverTrigger
                type="button"
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  ADMIN_HELP_TRIGGER_BUTTON,
                )}
              >
                <Info className="size-4 text-[var(--impronta-gold)]" aria-hidden />
                How it works
              </PopoverTrigger>
              <PopoverContent align="end" className={ADMIN_POPOVER_CONTENT_CLASS}>
                <div className="space-y-2">
                  <p className="font-display text-sm font-medium text-foreground">Taxonomy basics</p>
                  <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed text-muted-foreground">
                    <li>Use terms to tag profiles and power filters.</li>
                    <li>Archive terms instead of deleting to preserve history.</li>
                    <li>Reorder terms to control UI scan order within a kind.</li>
                    <li>Optional marketing image per term (upload or AI) and home placement — edit any term.</li>
                    <li>
                      Location Countries and Location Cities at the bottom are read-only mirrors synced from{" "}
                      <span className="font-mono text-[11px]">/admin/locations</span>.
                    </li>
                    <li>Set a talent’s public location on the talent admin page (identity), not in Taxonomy.</li>
                  </ul>
                </div>
              </PopoverContent>
            </Popover>
            <form
              className="flex w-full max-w-sm flex-col gap-2 sm:items-end"
              action="/admin/taxonomy"
              method="get"
            >
              {showArchived ? <input type="hidden" name="show" value="archived" /> : null}
              <Input
                name="q"
                defaultValue={filterQ}
                placeholder="Search name or slug…"
                className={ADMIN_FORM_CONTROL}
              />
              <Button type="submit" size="sm" variant="secondary" className="w-full sm:w-auto">
                Search
              </Button>
            </form>
            {showArchived ? (
              <Link
                href={filterQ ? `/admin/taxonomy?q=${encodeURIComponent(filterQ)}` : "/admin/taxonomy"}
                scroll={false}
                className={ADMIN_LINK_PILL}
              >
                Show active
              </Link>
            ) : (
              <Link
                href={
                  filterQ
                    ? `/admin/taxonomy?show=archived&q=${encodeURIComponent(filterQ)}`
                    : "/admin/taxonomy?show=archived"
                }
                scroll={false}
                className={ADMIN_LINK_PILL}
              >
                Show archived
              </Link>
            )}
          </div>
        }
      />

      {/* Create form */}
      <DashboardSectionCard title="Add term" description={null} titleClassName={ADMIN_SECTION_TITLE_CLASS}>
        <CreateTermForm />
      </DashboardSectionCard>

      {noTermsAtAll ? (
        <p className="text-sm text-muted-foreground">
          {showArchived ? "No archived terms." : "No terms yet. Add one above."}
        </p>
      ) : userKindsWithTerms.length > 0 ? (
        <div className={ADMIN_GROUP_LIST_GAP}>
          <p className="px-0.5 font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Taxonomy groups
          </p>
          {userKindsWithTerms.map((kind) => {
            const kindTerms = sortTermsStable(grouped[kind] ?? []);
            const title = GROUP_LABELS[kind] ?? kind;
            return (
              <DashboardSectionCard
                key={kind}
                title={title}
                description={null}
                titleClassName={ADMIN_SECTION_TITLE_CLASS}
              >
                <TaxonomyKindPanel
                  title={title}
                  kind={kind}
                  showArchived={showArchived}
                  systemManaged={false}
                  aiTaxonomyImageEnabled={aiTaxonomyImageEnabled}
                  terms={(kindTerms as Term[]) as unknown as AdminTaxonomyTerm[]}
                />
              </DashboardSectionCard>
            );
          })}
        </div>
      ) : null}

      {/* Derived location mirrors — visually separate from editable taxonomy */}
      <DashboardSectionCard
        title="Location support terms (read-only)"
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
        description={
          <span className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Locations</span> at{" "}
            <Link href="/admin/locations" className="font-medium text-[var(--impronta-gold)] underline underline-offset-4">
              /admin/locations
            </Link>{" "}
            is the only place to create, rename, archive, or restore canonical cities and countries. The two groups
            below are <span className="font-medium text-foreground">auto-derived</span> for directory labels and
            filters — not a second location system.{" "}
            <span className="font-medium text-foreground">Talent profile location</span> is set on each talent’s admin
            page (identity), not here.
          </span>
        }
        className="border-dashed border-[var(--impronta-gold-border)]/55 bg-card/35"
      >
        <div className="space-y-6">
          {LOCATION_KIND_ORDER.map((kind) => {
            const kindTerms = sortTermsStable(grouped[kind] ?? []);
            const title = GROUP_LABELS[kind] ?? kind;
            return (
              <div key={kind}>
                <TaxonomyKindPanel
                  title={title}
                  kind={kind}
                  showArchived={showArchived}
                  systemManaged
                  defaultExpanded
                  aiTaxonomyImageEnabled={aiTaxonomyImageEnabled}
                  terms={(kindTerms as Term[]) as unknown as AdminTaxonomyTerm[]}
                />
              </div>
            );
          })}
        </div>
      </DashboardSectionCard>
    </div>
  );
}
