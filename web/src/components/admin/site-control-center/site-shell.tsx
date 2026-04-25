"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  Code2,
  FileText,
  Globe2,
  Inbox,
  Key,
  LayoutDashboard,
  LayoutGrid,
  Menu,
  Network,
  Newspaper,
  Palette,
  Search,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { DrawerShell } from "@/components/admin/drawer/drawer-shell";

import { SiteCard } from "./site-card";
import {
  PLAN_COLOR,
  TIER_BANDS,
  isLocked,
  type Capability,
  type Plan,
} from "./capability-catalog";
import {
  ActivityDrawerBody,
  BrandingDrawerBody,
  DirectoryDrawerBody,
  InquiriesDrawerBody,
  LockedDrawerBody,
  PagesDrawerBody,
  PostsDrawerBody,
  RosterDrawerBody,
  StubDrawerBody,
} from "./site-drawer-content";

/**
 * SiteShell — client component that owns drawer state for the Site control
 * center. Renders the four tier bands (every-plan / studio / agency /
 * network), each a grid of SiteCards. Click on any card opens the right-
 * side drawer with the appropriate body. Locked cards open the upgrade
 * drawer body instead of navigating.
 */

type DrawerEntry = {
  title: string;
  subtitle: string;
  icon: LucideIcon;
  /** Wide drawer (lg:max-w-3xl) for list+detail capabilities. */
  wide?: boolean;
  body: (ctx: { activePlan: Plan; capability: Capability }) => React.ReactNode;
};

const DRAWER_REGISTRY: Record<string, DrawerEntry> = {
  roster: {
    title: "Roster",
    subtitle: "Talents · drafts · approvals",
    icon: Users,
    body: () => <RosterDrawerBody />,
  },
  directory: {
    title: "Directory settings",
    subtitle: "Render · templates · fields",
    icon: LayoutGrid,
    body: () => <DirectoryDrawerBody />,
  },
  inquiries: {
    title: "Inquiries",
    subtitle: "Open · in progress · won",
    icon: Inbox,
    body: () => <InquiriesDrawerBody />,
  },
  branding: {
    title: "Branding",
    subtitle: "Logo · fonts · colors",
    icon: Sparkles,
    body: () => <BrandingDrawerBody />,
  },
  activity: {
    title: "Activity",
    subtitle: "Recent workspace events",
    icon: Activity,
    body: () => <ActivityDrawerBody />,
  },
  widgets: {
    title: "Widgets",
    subtitle: "Embeds for any external site",
    icon: LayoutDashboard,
    body: () => (
      <StubDrawerBody
        body="Create roster grid / featured shelf / inquiry form widgets, configure filters, and copy the embed snippet."
        legacyHref="/admin/site/widgets"
      />
    ),
  },
  api: {
    title: "API keys",
    subtitle: "Read-only JSON for partners",
    icon: Key,
    body: () => (
      <StubDrawerBody
        body="Create keys, scope domains, rotate, and view usage / rate limits."
        legacyHref="/admin/site/api-keys"
      />
    ),
  },
  domain: {
    title: "Domain & home",
    subtitle: "Subdomain · custom domain",
    icon: Globe2,
    body: () => (
      <StubDrawerBody
        body="Subdomain config, custom domain (Agency), homepage assignment, blog index assignment."
        legacyHref="/admin/site/domain"
      />
    ),
  },
  homepage: {
    title: "Homepage",
    subtitle: "Your branded landing page",
    icon: Star,
    body: () => (
      <StubDrawerBody
        body="Open the live homepage in edit mode — composition, inline text, image replace, publish."
        legacyHref="/admin/site-settings/structure"
      />
    ),
  },
  pages: {
    title: "Pages",
    subtitle: "12 pages · 3 drafts",
    icon: FileText,
    wide: true,
    body: () => <PagesDrawerBody />,
  },
  posts: {
    title: "Posts",
    subtitle: "Editorial articles · drafts",
    icon: Newspaper,
    wide: true,
    body: () => <PostsDrawerBody />,
  },
  navigation: {
    title: "Navigation & footer",
    subtitle: "Header · footer columns",
    icon: Menu,
    body: () => (
      <StubDrawerBody
        body="Drag-and-drop directly on the live site. Edit nav, reorder, add custom links, build footer columns."
        legacyHref="/admin/site-settings/content/navigation"
      />
    ),
  },
  theme: {
    title: "Theme & foundations",
    subtitle: "Active preset · token overrides",
    icon: Palette,
    body: () => (
      <StubDrawerBody
        body="Theme library gallery · preset tokens · layout variants · typography system."
        legacyHref="/admin/site-settings/design"
      />
    ),
  },
  seo: {
    title: "SEO & defaults",
    subtitle: "Meta · sitemap · redirects",
    icon: Search,
    body: () => (
      <StubDrawerBody
        body="Site-wide meta template · sitemap · robots · redirect rules · per-page overrides."
        legacyHref="/admin/site-settings/seo"
      />
    ),
  },
  hub: {
    title: "Hub publishing",
    subtitle: "Cross-agency discovery",
    icon: Network,
    body: () => (
      <StubDrawerBody
        body="Promote approved talent · cross-agency discovery · hub inquiry routing."
        legacyHref="/admin/site/hub"
      />
    ),
  },
  multiagency: {
    title: "Multi-agency manager",
    subtitle: "Multiple brands, one workspace",
    icon: Code2,
    body: () => (
      <StubDrawerBody
        body="Switch agencies · invite managers · scope roles · consolidated billing."
        legacyHref="/admin/site/multi-agency"
      />
    ),
  },
};

export function SiteShell({ activePlan }: { activePlan: Plan }) {
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [openCapability, setOpenCapability] =
    React.useState<Capability | null>(null);
  const [openLocked, setOpenLocked] = React.useState(false);

  function handleOpen(cap: Capability, locked: boolean) {
    setOpenId(cap.id);
    setOpenCapability(cap);
    setOpenLocked(locked);
  }

  const entry = openId ? DRAWER_REGISTRY[openId] : null;
  const fallbackEntry: DrawerEntry | null = openCapability
    ? {
        title: openCapability.label,
        subtitle: openCapability.stat,
        icon: openCapability.icon,
        body: () => (
          <StubDrawerBody body="This capability does not have a quick-edit drawer yet." />
        ),
      }
    : null;
  const drawer = entry ?? fallbackEntry;

  return (
    <>
      <div className="space-y-8">
        {TIER_BANDS.map((band) => {
          const bandLocked = isLocked(band.tier, activePlan);
          const accent = PLAN_COLOR[band.tier];
          return (
            <section key={band.tier} className="space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em]"
                  style={{ backgroundColor: accent.bg, color: accent.fg }}
                >
                  {band.badgeLabel}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-[17px] font-semibold tracking-tight text-foreground sm:text-lg">
                    {band.headline}
                  </h2>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {band.helper}
                  </p>
                </div>
                {bandLocked && band.ctaLabel ? (
                  <Link
                    href={
                      band.tier === "network"
                        ? "mailto:hello@impronta.group"
                        : `?plan=${band.tier}`
                    }
                    className="rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition-transform hover:-translate-y-px"
                    style={{ backgroundColor: accent.bg, color: accent.fg }}
                  >
                    {band.ctaLabel}
                  </Link>
                ) : null}
                <div
                  aria-hidden
                  className="hidden h-px flex-1 bg-border/50 sm:block"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {band.cards.map((card) => (
                  <SiteCard
                    key={card.id}
                    capability={card}
                    locked={bandLocked}
                    onClick={() => handleOpen(card, bandLocked)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <DrawerShell
        open={openId !== null && drawer !== null}
        onOpenChange={(open) => {
          if (!open) {
            setOpenId(null);
            setOpenCapability(null);
            setOpenLocked(false);
          }
        }}
        title={drawer?.title ?? ""}
        subtitle={drawer?.subtitle}
        icon={drawer?.icon ?? Sparkles}
        wide={drawer?.wide}
      >
        {drawer && openCapability ? (
          openLocked ? (
            <LockedDrawerBody
              tier={openCapability.tier}
              copy={openCapability.lockedCopy}
              activePlan={activePlan}
            />
          ) : (
            drawer.body({ activePlan, capability: openCapability })
          )
        ) : null}
      </DrawerShell>
    </>
  );
}
