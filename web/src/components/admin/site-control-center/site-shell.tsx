"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
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
  PLAN_BADGE_COLOR,
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
import { UpgradeModal } from "./upgrade-modal";

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
    title: "Directory Settings",
    subtitle: "Render · templates · fields",
    icon: LayoutGrid,
    body: () => <DirectoryDrawerBody />,
  },
  inquiries: {
    title: "Inquiries",
    subtitle: "1 open · 3 in progress",
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
    subtitle: "2 active · 4 embeds",
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
    subtitle: "1 key · last used 3h ago",
    icon: Key,
    body: () => (
      <StubDrawerBody
        body="Create keys, scope domains, rotate, and view usage / rate limits."
        legacyHref="/admin/site/api-keys"
      />
    ),
  },
  domain: {
    title: "Domain & Home",
    subtitle: "nova.rostra.app",
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
    subtitle: "Draft pending · 2h ago",
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
    subtitle: "5 posts · 1 draft",
    icon: Newspaper,
    wide: true,
    body: () => <PostsDrawerBody />,
  },
  navigation: {
    title: "Navigation & Footer",
    subtitle: "Header 5 · Footer 3 cols",
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
    subtitle: "Editorial Noir",
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
    subtitle: "Network only",
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
    subtitle: "Network only",
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
  const router = useRouter();
  const pathname = usePathname() ?? "/admin/site";
  const searchParams = useSearchParams();
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [openCapability, setOpenCapability] =
    React.useState<Capability | null>(null);
  const [openLocked, setOpenLocked] = React.useState(false);
  const [upgradeOpen, setUpgradeOpen] = React.useState(false);

  function handleOpen(cap: Capability, locked: boolean) {
    setOpenId(cap.id);
    setOpenCapability(cap);
    setOpenLocked(locked);
  }

  function handleUpgradeSelect(plan: Plan) {
    const params = new URLSearchParams(
      searchParams ? Array.from(searchParams.entries()) : [],
    );
    if (plan === "free") {
      params.delete("plan");
    } else {
      params.set("plan", plan);
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
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
                  {band.badgeLabel}
                </span>
                <h2 className="text-[15px] font-semibold tracking-[-0.005em] text-foreground">
                  {band.headline}
                </h2>
                <span className="text-[12px] text-muted-foreground">
                  {band.helper}
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
                      {band.ctaLabel} →
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setUpgradeOpen(true)}
                      className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[11.5px] font-semibold transition-colors hover:bg-foreground/[0.04]"
                      style={{ color: accent.fg }}
                    >
                      {band.ctaLabel} →
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
              onUpgrade={() => {
                setOpenId(null);
                setOpenCapability(null);
                setOpenLocked(false);
                setUpgradeOpen(true);
              }}
            />
          ) : (
            drawer.body({ activePlan, capability: openCapability })
          )
        ) : null}
      </DrawerShell>

      <UpgradeModal
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        activePlan={activePlan}
        onSelect={handleUpgradeSelect}
      />
    </>
  );
}
