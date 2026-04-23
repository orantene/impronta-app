import Link from "next/link";
import { ArrowRight, LayoutPanelLeft, Palette, Sparkles } from "lucide-react";

import { DashboardSectionCard } from "@/components/dashboard/dashboard-section-card";
import { ADMIN_SECTION_TITLE_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

type OverviewCard = {
  href: string;
  title: string;
  description: string;
  icon: typeof Sparkles;
  primary?: boolean;
};

const OVERVIEW_CARDS: OverviewCard[] = [
  {
    href: "/admin/site-settings/structure",
    title: "Compose your homepage",
    description:
      "Drag-and-drop sections, preview as a draft, publish when ready. Start from a preset if this is the first time.",
    icon: Sparkles,
    primary: true,
  },
  {
    href: "/admin/site-settings/identity",
    title: "Identity",
    description:
      "Agency name, legal entity, tagline, and the locales you publish in.",
    icon: LayoutPanelLeft,
  },
  {
    href: "/admin/site-settings/branding",
    title: "Branding",
    description:
      "Logo, favicon, core colors, and typography that flow through every storefront surface.",
    icon: Palette,
  },
  {
    href: "/admin/site-settings/design",
    title: "Design tokens",
    description:
      "Full token registry — apply a preset family or tune individual values. Changes stage as a draft.",
    icon: Palette,
  },
  {
    href: "/admin/site-settings/sections",
    title: "Sections library",
    description:
      "Reusable content blocks (hero, feature list, CTA band). Compose them onto pages without rewriting copy.",
    icon: LayoutPanelLeft,
  },
  {
    href: "/admin/site-settings/pages",
    title: "Pages & content",
    description:
      "Manage static pages, posts, navigation menus, redirects, and SEO metadata for each locale.",
    icon: LayoutPanelLeft,
  },
];

export default function SiteSettingsOverviewPage() {
  return (
    <div className="space-y-4">
      <DashboardSectionCard
        title="Site settings"
        description="Everything that shapes your public storefront — identity, branding, homepage composition, sections, and content. Changes stage as drafts; publishing pushes live."
        titleClassName={ADMIN_SECTION_TITLE_CLASS}
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {OVERVIEW_CARDS.map((card) => {
            const Icon = card.icon;
            return (
              <Link
                key={card.href}
                href={card.href}
                scroll={false}
                className={cn(
                  "group flex flex-col rounded-2xl border p-5 shadow-sm outline-none transition-all duration-200",
                  card.primary
                    ? "border-[var(--impronta-gold-border)]/55 bg-gradient-to-br from-[var(--impronta-gold)]/[0.08] via-background to-background hover:border-[var(--impronta-gold-border)] hover:shadow-md"
                    : "border-border/60 bg-muted/10 hover:border-[var(--impronta-gold-border)]/55 hover:bg-[var(--impronta-gold)]/[0.03]",
                  "focus-visible:border-[var(--impronta-gold-border)] focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/35",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 items-center justify-center rounded-xl ring-1",
                    card.primary
                      ? "bg-[var(--impronta-gold)]/15 text-[var(--impronta-gold)] ring-[var(--impronta-gold)]/25"
                      : "bg-muted text-foreground ring-border/70",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </span>
                <p className="mt-3 text-sm font-semibold text-foreground">
                  {card.title}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {card.description}
                </p>
                <p
                  className={cn(
                    "mt-3 inline-flex items-center gap-1 text-xs font-semibold",
                    card.primary
                      ? "text-foreground"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                >
                  Open
                  <ArrowRight
                    className="size-3.5 transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </p>
              </Link>
            );
          })}
        </div>
      </DashboardSectionCard>
    </div>
  );
}
