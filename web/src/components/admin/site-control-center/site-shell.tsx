"use client";

import * as React from "react";
import Link from "next/link";

import { useUpgradeModal } from "./upgrade-context";
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

import { useT } from "@/i18n/use-t";
import type { Translator } from "@/i18n/interpolate";
import { DrawerShell } from "@/components/admin/drawer/drawer-shell";

import { SiteCard } from "./site-card";
import {
  PLAN_BADGE_COLOR,
  TIER_BANDS,
  catalogCopy,
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

/**
 * Drawer copy is localized the same way the capability catalog is: the English
 * literal stays in the module as the fallback, and the `*Key` beside it is what
 * actually renders. A `key` of `""` means "never translate this" (the `domain`
 * subtitle is a hostname).
 */
type DrawerEntry = {
  title: string;
  titleKey: string;
  subtitle: string;
  subtitleKey: string;
  icon: LucideIcon;
  /** Wide drawer (lg:max-w-3xl) for list+detail capabilities. */
  wide?: boolean;
  body: (ctx: {
    activePlan: Plan;
    capability: Capability;
    t: Translator;
  }) => React.ReactNode;
};

/** Localized stub blurb for a drawer id, English literal as the fallback. */
function stubBody(t: Translator, id: string, english: string): string {
  return catalogCopy(t, `dashboard.adminSiteDrawers.${id}.body`, english);
}

const DRAWER_REGISTRY: Record<string, DrawerEntry> = {
  roster: {
    title: "Roster",
    titleKey: "dashboard.adminSiteDrawers.roster.title",
    subtitle: "Talents · drafts · approvals",
    subtitleKey: "dashboard.adminSiteDrawers.roster.subtitle",
    icon: Users,
    body: () => <RosterDrawerBody />,
  },
  directory: {
    title: "Directory Settings",
    titleKey: "dashboard.adminSiteDrawers.directory.title",
    subtitle: "Render · templates · fields",
    subtitleKey: "dashboard.adminSiteDrawers.directory.subtitle",
    icon: LayoutGrid,
    body: () => <DirectoryDrawerBody />,
  },
  inquiries: {
    title: "Inquiries",
    titleKey: "dashboard.adminSiteDrawers.inquiries.title",
    subtitle: "1 open · 3 in progress",
    subtitleKey: "dashboard.adminSiteDrawers.inquiries.subtitle",
    icon: Inbox,
    body: () => <InquiriesDrawerBody />,
  },
  branding: {
    title: "Branding",
    titleKey: "dashboard.adminSiteDrawers.branding.title",
    subtitle: "Logo · fonts · colors",
    subtitleKey: "dashboard.adminSiteDrawers.branding.subtitle",
    icon: Sparkles,
    body: () => <BrandingDrawerBody />,
  },
  activity: {
    title: "Activity",
    titleKey: "dashboard.adminSiteDrawers.activity.title",
    subtitle: "Recent workspace events",
    subtitleKey: "dashboard.adminSiteDrawers.activity.subtitle",
    icon: Activity,
    body: () => <ActivityDrawerBody />,
  },
  widgets: {
    title: "Widgets",
    titleKey: "dashboard.adminSiteDrawers.widgets.title",
    subtitle: "2 active · 4 embeds",
    subtitleKey: "dashboard.adminSiteDrawers.widgets.subtitle",
    icon: LayoutDashboard,
    body: ({ t }) => (
      <StubDrawerBody
        body={stubBody(
          t,
          "widgets",
          "Create roster grid / featured shelf / inquiry form widgets, configure filters, and copy the embed snippet.",
        )}
        legacyHref="/admin/site/widgets"
      />
    ),
  },
  api: {
    title: "API keys",
    titleKey: "dashboard.adminSiteDrawers.api.title",
    subtitle: "1 key · last used 3h ago",
    subtitleKey: "dashboard.adminSiteDrawers.api.subtitle",
    icon: Key,
    body: ({ t }) => (
      <StubDrawerBody
        body={stubBody(
          t,
          "api",
          "Create keys, scope domains, rotate, and view usage / rate limits.",
        )}
        legacyHref="/admin/site/api-keys"
      />
    ),
  },
  domain: {
    title: "Domain & Home",
    titleKey: "dashboard.adminSiteDrawers.domain.title",
    // Hostname — never translated.
    subtitle: "nova.tulala.digital",
    subtitleKey: "",
    icon: Globe2,
    body: ({ t }) => (
      <StubDrawerBody
        body={stubBody(
          t,
          "domain",
          "Subdomain config, custom domain (Agency), homepage assignment, blog index assignment.",
        )}
        legacyHref="/admin/site/domain"
      />
    ),
  },
  homepage: {
    title: "Homepage",
    titleKey: "dashboard.adminSiteDrawers.homepage.title",
    subtitle: "Draft pending · 2h ago",
    subtitleKey: "dashboard.adminSiteDrawers.homepage.subtitle",
    icon: Star,
    body: ({ t }) => (
      <StubDrawerBody
        body={stubBody(
          t,
          "homepage",
          "Open the live homepage in edit mode: composition, inline text, image replace, publish.",
        )}
        setupHref="/admin/site/setup/homepage"
        legacyHref="/"
      />
    ),
  },
  pages: {
    title: "Pages",
    titleKey: "dashboard.adminSiteDrawers.pages.title",
    subtitle: "12 pages · 3 drafts",
    subtitleKey: "dashboard.adminSiteDrawers.pages.subtitle",
    icon: FileText,
    wide: true,
    body: ({ t }) => (
      <StubDrawerBody
        body={stubBody(
          t,
          "pages",
          "Marketing, legal, and editorial pages served at /p/…. Setup wraps the list in premium chrome with quick filters.",
        )}
        setupHref="/admin/site/setup/pages"
        legacyHref="/admin/site-settings/content/pages"
      />
    ),
  },
  posts: {
    title: "Posts",
    titleKey: "dashboard.adminSiteDrawers.posts.title",
    subtitle: "5 posts · 1 draft",
    subtitleKey: "dashboard.adminSiteDrawers.posts.subtitle",
    icon: Newspaper,
    wide: true,
    body: ({ t }) => (
      <StubDrawerBody
        body={stubBody(
          t,
          "posts",
          "Editorial articles served at /posts/…. Setup walks through writing, scheduling, and publishing the first one.",
        )}
        setupHref="/admin/site/setup/posts"
        legacyHref="/admin/site-settings/content/posts"
      />
    ),
  },
  navigation: {
    title: "Navigation & Footer",
    titleKey: "dashboard.adminSiteDrawers.navigation.title",
    subtitle: "Header 5 · Footer 3 cols",
    subtitleKey: "dashboard.adminSiteDrawers.navigation.subtitle",
    icon: Menu,
    body: ({ t }) => (
      <StubDrawerBody
        body={stubBody(
          t,
          "navigation",
          "Drag-and-drop directly on the live site. Edit nav, reorder, add custom links, build footer columns.",
        )}
        setupHref="/admin/site/setup/navigation"
        legacyHref="/admin/site-settings/content/navigation"
      />
    ),
  },
  theme: {
    title: "Theme & foundations",
    titleKey: "dashboard.adminSiteDrawers.theme.title",
    subtitle: "Editorial Noir",
    subtitleKey: "dashboard.adminSiteDrawers.theme.subtitle",
    icon: Palette,
    body: ({ t }) => (
      <StubDrawerBody
        body={stubBody(
          t,
          "theme",
          "Pick a designer kit: colors, typography, motion, density, layout, all in one click. Token-level overrides still possible.",
        )}
        setupHref="/admin/site/setup/theme"
        legacyHref="/admin/site-settings/design"
      />
    ),
  },
  seo: {
    title: "SEO & defaults",
    titleKey: "dashboard.adminSiteDrawers.seo.title",
    subtitle: "Meta · sitemap · redirects",
    subtitleKey: "dashboard.adminSiteDrawers.seo.subtitle",
    icon: Search,
    body: ({ t }) => (
      <StubDrawerBody
        body={stubBody(
          t,
          "seo",
          "Site-wide meta template · sitemap · robots · redirect rules · per-page overrides.",
        )}
        setupHref="/admin/site/setup/seo"
        legacyHref="/admin/site-settings/seo"
      />
    ),
  },
  hub: {
    title: "Hub publishing",
    titleKey: "dashboard.adminSiteDrawers.hub.title",
    subtitle: "Network only",
    subtitleKey: "dashboard.adminSiteDrawers.hub.subtitle",
    icon: Network,
    body: ({ t }) => (
      <StubDrawerBody
        body={stubBody(
          t,
          "hub",
          "Promote approved talent · cross-agency discovery · hub inquiry routing.",
        )}
        legacyHref="/admin/site/hub"
      />
    ),
  },
  multiagency: {
    title: "Multi-agency manager",
    titleKey: "dashboard.adminSiteDrawers.multiagency.title",
    subtitle: "Network only",
    subtitleKey: "dashboard.adminSiteDrawers.multiagency.subtitle",
    icon: Code2,
    body: ({ t }) => (
      <StubDrawerBody
        body={stubBody(
          t,
          "multiagency",
          "Switch agencies · invite managers · scope roles · consolidated billing.",
        )}
        legacyHref="/admin/site/multi-agency"
      />
    ),
  },
};

/**
 * Locked-card pitch copy, localized. `Capability.lockedCopy` in the catalog is
 * a module-level English constant, so the drawer used to show an English pitch
 * inside an otherwise-Spanish surface. Keys are per capability id; the English
 * constant stays the fallback for ids that have no catalog entry yet.
 */
function lockedCopyFor(t: Translator, capability: Capability): string {
  const key = `dashboard.adminShared.drawer.lockedCopy.${capability.id}`;
  const resolved = t(key);
  return resolved === key ? capability.lockedCopy : resolved;
}

export function SiteShell({ activePlan }: { activePlan: Plan }) {
  const t = useT();
  const upgradeModal = useUpgradeModal();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [openCapability, setOpenCapability] =
    React.useState<Capability | null>(null);
  const [openLocked, setOpenLocked] = React.useState(false);

  function handleOpen(cap: Capability, locked: boolean) {
    setOpenId(cap.id);
    setOpenCapability(cap);
    setOpenLocked(locked);
  }

  function openUpgrade() {
    setOpenId(null);
    setOpenCapability(null);
    setOpenLocked(false);
    upgradeModal.setOpen(true);
  }

  const entry = openId ? DRAWER_REGISTRY[openId] : null;
  const fallbackEntry: DrawerEntry | null = openCapability
    ? {
        title: openCapability.label,
        titleKey: openCapability.labelKey,
        subtitle: openCapability.stat,
        subtitleKey: openCapability.statKey,
        icon: openCapability.icon,
        body: ({ t: tt }) => (
          <StubDrawerBody
            body={tt("dashboard.adminSiteDrawers.noQuickEdit")}
          />
        ),
      }
    : null;
  const drawer = entry ?? fallbackEntry;

  return (
    <>
      <div className="space-y-6">
        {TIER_BANDS.map((band) => {
          const bandLocked = isLocked(band.tier, activePlan);
          const accent = PLAN_BADGE_COLOR[band.tier];
          return (
            <section key={band.tier} className="space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[10.5px] font-bold uppercase tracking-[0.18em] before:size-1.5 before:rounded-full before:bg-current before:content-['']"
                  style={{ backgroundColor: accent.bg, color: accent.fg }}
                >
                  {catalogCopy(t, band.badgeLabelKey, band.badgeLabel)}
                </span>
                <h2 className="text-[15px] font-semibold tracking-[-0.005em] text-foreground">
                  {catalogCopy(t, band.headlineKey, band.headline)}
                </h2>
                <span className="text-[12px] text-muted-foreground">
                  {catalogCopy(t, band.helperKey, band.helper)}
                </span>
                <div
                  aria-hidden
                  className="hidden h-px min-w-[40px] flex-1 sm:block"
                  style={{
                    background:
                      band.tier === "studio"
                        ? "linear-gradient(to right, rgba(58,123,255,0.35), transparent 80%)"
                        : band.tier === "agency"
                          ? "linear-gradient(to right, rgba(139,109,31,0.45), transparent 80%)"
                          : band.tier === "network"
                            ? "linear-gradient(to right, rgba(20,107,58,0.4), transparent 80%)"
                            : "rgba(24, 24, 27, 0.1)",
                  }}
                />
                {bandLocked && band.ctaLabel ? (
                  band.tier === "network" ? (
                    <Link
                      href="mailto:hello@impronta.group"
                      className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[11.5px] font-semibold transition-colors hover:bg-foreground/[0.04]"
                      style={{ color: accent.fg }}
                    >
                      {catalogCopy(t, band.ctaLabelKey, band.ctaLabel)} →
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => openUpgrade()}
                      className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[11.5px] font-semibold transition-colors hover:bg-foreground/[0.04]"
                      style={{ color: accent.fg }}
                    >
                      {catalogCopy(t, band.ctaLabelKey, band.ctaLabel)} →
                    </button>
                  )
                ) : null}
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
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
        title={drawer ? catalogCopy(t, drawer.titleKey, drawer.title) : ""}
        subtitle={
          drawer ? catalogCopy(t, drawer.subtitleKey, drawer.subtitle) : undefined
        }
        icon={drawer?.icon ?? Sparkles}
        wide={drawer?.wide}
      >
        {drawer && openCapability ? (
          openLocked ? (
            <LockedDrawerBody
              tier={openCapability.tier}
              copy={lockedCopyFor(t, openCapability)}
              activePlan={activePlan}
              onUpgrade={openUpgrade}
            />
          ) : (
            drawer.body({ activePlan, capability: openCapability, t })
          )
        ) : null}
      </DrawerShell>
    </>
  );
}
