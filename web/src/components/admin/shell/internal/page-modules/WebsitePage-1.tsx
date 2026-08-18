"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { useT } from "@/i18n/use-t";
import { InfoTip } from "@/components/ui/info-tip";
import {
  resolveWebsiteEditorBaseUrl,
  resolveWebsiteLiveOrigin,
} from "@/lib/admin/website-editor-links";
import { interpolate } from "@/i18n/interpolate";
import { buildPostPublicPathname } from "@/lib/cms/paths";
import { EmptyState, Icon } from "../primitives";
import { COLORS, FONTS, TRANSITION, meetsRole, useAdminShell } from "../state";
import type { WebsitePost } from "../state";
import { CardDesignStudio } from "./CardDesignStudio";
import { ProfilePagesStudio } from "../../../profile-pages/ProfilePagesStudio";
import { PageStatusChip } from "./SitePage";
import { WebsiteHealthPanel } from "./WebsiteHealthPanel";
import { WebsitePerformance } from "./WebsitePage-2";
import { WebsiteLaunchpad } from "./WebsiteLaunchpad";
import { WebsitePagesPage, WebsitePagesPreview } from "./WebsitePagesSurface";
import { PageHeader } from "./pages-shared";
import { WebsiteDesignHub } from "./WebsiteDesignHub";
import { WebsiteDesignTabs } from "./website-design-tabs";
import { WebsiteSetupPage } from "./WebsiteSetupPage";
import { useWebsiteSubnav, type WebsiteSubnavItem } from "./website-nav";


// ════════════════════════════════════════════════════════════════════
// WEBSITE — the Overview, and the route dispatch for every sub-view.
//
// OVERVIEW IS A LAUNCHPAD (P4-A), NOT AN INVENTORY
// ────────────────────────────────────────────────
// It used to open with a gradient hero carrying four inert stat tiles, then
// the whole pages list, then a read-only copy of the redirects table. Three
// different things claimed to be the summary and none of them told an operator
// what to do next.
//
// It now answers four questions in order and then stops:
//   1. What is my site's address, and is it live?      → the hero
//   2. Does anything need attention?                   → WebsiteHealthPanel
//   3. Where do I go next?                             → WebsiteLaunchpad
//   4. What is my site made of?                        → WebsitePagesPreview
// Performance follows, collapsible; Posts closes the page.
//
// WHAT LEFT, AND WHERE IT WENT
//   • The 4 hero stat tiles      → re-expressed as live counts on the
//                                   launchpad card of the thing they describe.
//   • The full Pages list        → `/website/pages` (WebsitePagesSurface.tsx).
//   • The read-only Redirects    → `/website/redirects` owns it, and the health
//     rows                         panel already surfaces redirect problems.
//   • Configuration              → `/website/setup` (#1244).
// ════════════════════════════════════════════════════════════════════

/**
 * Website is one surface with two sub-views: the site-management body and the
 * Card Design studio. Both live under the same top-nav "Website" tab; this
 * pill switcher is the in-page way to move between them (the topbar hover
 * dropdown is the other). The active view is derived from the pathname so the
 * deep link (`/[slug]/admin/website/card-design`) and the breadcrumb stay in
 * sync — see admin-shell-top-bar SUBROUTE_LABELS.
 */
function WebsiteSubviewTabs({
  active,
}: {
  /** "site" is this strip's legacy local id for the Overview destination. */
  active: "site" | WebsiteSubnavItem["id"];
}) {
  const t = useT();
  const router = useRouter();
  // Single source of truth (website-nav.ts), minus any external link: a pill
  // cannot open a new tab and read as "active" at the same time. Every item is
  // internal since Design became a hub route, but the filter stays — the field
  // is still part of the item shape. This is what finally gives mobile (rail
  // hidden ≤720px) a way to reach the destinations the strip used to omit,
  // Redirects and Forms among them.
  const tabs = useWebsiteSubnav()
    .filter(item => !item.external)
    .map(item => ({
      id: item.id === "overview" ? "site" : item.id,
      label: t(item.i18nKey),
      href: item.href,
    }));
  // De-dup with a mobile carve-out: on desktop the sidebar rail shows these
  // three destinations as nested sub-links under Website, so the tab strip
  // is hidden there. At ≤720px the rail itself is hidden (bottom tab bar
  // takes over page-level nav), so this strip returns as the only sub-view
  // switcher. Display is class-driven so the media query owns it.
  return (
    <div
      role="tablist"
      aria-label={t("dashboard.adminWebsite.subviewAria")}
      data-tulala-website-subview-tabs
      className="hidden max-[720px]:inline-flex"
      style={{
        gap: 4,
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 999,
        padding: 3,
        marginBottom: 16,
        fontFamily: FONTS.body,
      }}
    >
      {tabs.map(tab => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => router.push(tab.href)}
            style={{
              border: "none",
              borderRadius: 999,
              padding: "6px 14px",
              fontSize: 12.5,
              fontWeight: isActive ? 600 : 500,
              cursor: "pointer",
              background: isActive ? COLORS.card : "transparent",
              color: isActive ? COLORS.ink : COLORS.inkMuted,
              boxShadow: isActive ? COLORS.shadow : "none",
              transition: `background ${TRANSITION.micro}`,
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

export function WebsitePage() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const {
    state,
    toast,
    effectiveWebsiteState,
    locale,
    tenantSlug,
    adminBasePath,
  } = useAdminShell();
  const canEdit = meetsRole(state.role, "admin");
  const w = effectiveWebsiteState;
  const isCardDesign = pathname?.endsWith("/website/card-design") ?? false;
  const isProfilePages = pathname?.endsWith("/website/profile-pages") ?? false;
  const isDesignHub = pathname?.endsWith("/website/design") ?? false;
  const isSetup = pathname?.endsWith("/website/setup") ?? false;
  const isPagesRoute = pathname?.endsWith("/website/pages") ?? false;

  const [windowOrigin, setWindowOrigin] = useState("");
  useEffect(() => {
    setWindowOrigin(window.location.origin);
  }, []);

  const liveOrigin = useMemo(
    () => resolveWebsiteLiveOrigin(w.domain.primaryDomain, windowOrigin),
    [w.domain.primaryDomain, windowOrigin],
  );
  const editorBaseUrl = useMemo(
    () => resolveWebsiteEditorBaseUrl({ liveOrigin, tenantSlug, windowOrigin }),
    [liveOrigin, tenantSlug, windowOrigin],
  );
  // Site theme + site header/footer entry points MOVED to the Design hub
  // (`/website/design`, WebsiteDesignHub.tsx). They were two of four scattered
  // ways to change how the site looks; the hub is the one place that names the
  // set. Overview links there rather than duplicating any of it.

  const openPostOnLive = useCallback(
    (post: WebsitePost) => {
      if (!liveOrigin) {
        toast(t("dashboard.adminWebsite.toastLiveUrlUnavailable"));
        return;
      }
      const raw = post.slug.trim().replace(/^\/+/u, "");
      const firstSegment = raw.split("/").filter(Boolean)[0] ?? "";
      const pathname = buildPostPublicPathname(locale as Locale, firstSegment);
      window.open(`${liveOrigin}${pathname}`, "_blank", "noopener,noreferrer");
      toast(t("dashboard.adminWebsite.toastOpeningPost"));
    },
    [liveOrigin, locale, t, toast],
  );

  const openHomepageEditor = useCallback(() => {
    if (!editorBaseUrl) {
      toast(t("dashboard.adminWebsite.toastLiveUrlUnavailable"));
      return;
    }
    window.open(`${editorBaseUrl}?edit=1&panel=sections`, "_blank", "noopener,noreferrer");
    toast(t("dashboard.adminWebsite.toastOpeningHomepageEditor"));
  }, [editorBaseUrl, t, toast]);

  const fmtMoney = (n: number) => `€${n.toLocaleString()}`;

  // Design / Cards / Profiles additionally carry the local design strip, so
  // the three surfaces read as one place without merging their routes.
  if (isCardDesign) {
    return (
      <>
        <WebsiteSubviewTabs active="card-design" />
        <WebsiteDesignTabs active="card-design" />
        <CardDesignStudio />
      </>
    );
  }

  if (isProfilePages) {
    return (
      <>
        <WebsiteSubviewTabs active="profile-pages" />
        <WebsiteDesignTabs active="profile-pages" />
        <ProfilePagesStudio />
      </>
    );
  }

  if (isDesignHub) {
    return (
      <>
        <WebsiteSubviewTabs active="design" />
        <WebsiteDesignHub />
      </>
    );
  }

  if (isSetup) {
    return (
      <>
        <WebsiteSubviewTabs active="setup" />
        <WebsiteSetupPage />
      </>
    );
  }

  if (isPagesRoute) {
    return (
      <>
        <WebsiteSubviewTabs active="pages" />
        <WebsitePagesPage />
      </>
    );
  }

  return (
    <>
      <WebsiteSubviewTabs active="site" />
      <PageHeader
        title={t("dashboard.adminWebsite.title")}
        subtitle={t("dashboard.adminWebsite.subtitle")}
        actions={
          !canEdit ? (
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">{t("dashboard.adminWebsite.readOnly")}</span>
          ) : undefined
        }
      />

      {/* Hero — the address, whether it is live, and the three things an
          operator does from here. The four stat tiles that used to sit under
          this are gone: their numbers now live on the launchpad card of the
          destination that can act on them. */}
      <section className="mb-[18px] rounded-admin-xl border border-admin-border bg-admin-accent-soft p-[18px] font-admin-body">
        <div className="flex flex-wrap items-center gap-x-[10px] gap-y-[8px]">
          <span className="text-admin-10h font-bold uppercase tracking-[0.7px] text-admin-ink-muted">
            {t("dashboard.adminWebsite.liveUrl")}
          </span>
          <span className="break-all font-mono text-admin-15 font-semibold text-admin-ink">
            {liveOrigin || "—"}
          </span>
          <button
            type="button"
            disabled={!liveOrigin}
            onClick={() => {
              try {
                navigator.clipboard.writeText(liveOrigin);
              } catch {}
              toast(t("dashboard.adminWebsite.toastCopied"));
            }}
            className="cursor-pointer rounded-full border border-admin-border bg-admin-card px-[10px] py-[3px] text-admin-11 font-semibold text-admin-ink disabled:cursor-not-allowed disabled:opacity-45"
          >
            {t("dashboard.adminWebsite.copy")}
          </button>
          <span className="ml-auto inline-flex items-center gap-[6px] text-admin-12h font-semibold text-admin-ink">
            <span
              aria-hidden
              className={`size-[8px] shrink-0 rounded-full ${w.maintenance.enabled ? "bg-admin-amber-deep" : "bg-admin-success-deep"}`}
            />
            {w.maintenance.enabled
              ? t("dashboard.adminWebsite.inMaintenance")
              : t("dashboard.adminWebsite.live")}
            <InfoTip
              label={t("dashboard.adminWebsite.heroStatusInfo")}
              triggerLabel={t("dashboard.adminWebsite.designHub.whatIsThis")}
              placement="bottom-end"
              className="text-admin-ink-dim hover:text-admin-ink"
            />
          </span>
        </div>
        <div className="mt-[14px] flex flex-wrap gap-[8px]">
          <button
            type="button"
            disabled={!liveOrigin}
            onClick={() => liveOrigin && window.open(liveOrigin, "_blank", "noopener,noreferrer")}
            className="inline-flex cursor-pointer items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-12h font-semibold text-admin-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Icon name="external" size={12} stroke={1.7} />
            {t("dashboard.adminWebsite.heroViewSite")}
          </button>
          <button
            type="button"
            disabled={!liveOrigin}
            onClick={openHomepageEditor}
            className="inline-flex cursor-pointer items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-12h font-semibold text-admin-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Icon name="pencil" size={12} stroke={1.7} />
            {t("dashboard.adminWebsite.heroEditSite")}
          </button>
          <button
            type="button"
            onClick={() => router.push(`${adminBasePath}/website/design`)}
            className="inline-flex cursor-pointer items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-12h font-semibold text-admin-ink"
          >
            <Icon name="palette" size={12} stroke={1.7} />
            {t("dashboard.adminWebsite.heroChangeDesign")}
          </button>
        </div>
      </section>

      {/* Server-computed findings: nothing on fixtures, one green line when well. */}
      <WebsiteHealthPanel report={w.health} />

      {/* Site banners — only render if any are active (Maintenance + Announcement collapsed) */}
      {(w.maintenance.enabled || w.announcement.enabled) && (
        <section style={{ marginBottom: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          {w.maintenance.enabled && (
            <div style={{ padding: "12px 16px", borderRadius: 12, border: `1px solid ${COLORS.amberDeep}33`, display: "flex", alignItems: "center", gap: 12, fontFamily: FONTS.body }} className="bg-admin-amber-soft">
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.amberDeep, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }} className="text-admin-amber-deep">{t("dashboard.adminWebsite.maintenanceModeActive")}</div>
                <div style={{ fontSize: 13, marginTop: 2 }} className="text-admin-ink">{w.maintenance.message}</div>
              </div>
              <button type="button" onClick={() => { try { navigator.clipboard.writeText(w.maintenance.bypassToken); } catch {} toast(t("dashboard.adminWebsite.toastBypassCopied")); }}
                style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, border: `1px solid ${COLORS.amberDeep}55`, background: "#fff", color: COLORS.amberDeep, fontWeight: 600, cursor: "pointer", fontFamily: FONTS.body, flexShrink: 0 }}>{t("dashboard.adminWebsite.copyBypass")}</button>
            </div>
          )}
          {w.announcement.enabled && (
            <div style={{ padding: "10px 14px", borderRadius: 10, background: w.announcement.tone === "info" ? COLORS.indigoSoft : w.announcement.tone === "success" ? COLORS.successSoft : w.announcement.tone === "warning" ? COLORS.amberSoft : COLORS.surfaceAlt, color: w.announcement.tone === "info" ? COLORS.indigoDeep : w.announcement.tone === "success" ? COLORS.successDeep : w.announcement.tone === "warning" ? COLORS.amberDeep : COLORS.ink, fontFamily: FONTS.body, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, border: `1px solid ${COLORS.borderSoft}` }}>
              <span className="text-admin-13 font-medium">📣 {w.announcement.text}</span>
              <span style={{ fontSize: 11, opacity: 0.7, textTransform: "uppercase", fontWeight: 700, letterSpacing: 0.6 }}>{w.announcement.audience}</span>
            </div>
          )}
        </section>
      )}

      {/* Where to go next — one card per Website destination, driven by the
          same `useWebsiteSubnav()` list the sidebar reads. */}
      <WebsiteLaunchpad />

      {/* What the site is made of — the first rows of the shared sort, with
          "Add page" and a link to the full list at /website/pages. */}
      <WebsitePagesPreview />

      {/* Performance — collapsible; KPI tiles + funnel + Top performers. */}
      <WebsitePerformance analytics={w.analytics} pages={w.pages} fmtMoney={fmtMoney} />

      {/* Posts. The read-only Redirects column that used to sit beside this is
          gone: Redirects has its own route, the launchpad links to it with a
          live count, and the health panel is what surfaces a broken one. */}
      <section style={{ marginBottom: 22 }}>
        {/* Posts column */}
        <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, padding: 16, fontFamily: FONTS.body }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 15, fontWeight: 600 }} className="text-admin-ink">
              {t("dashboard.adminWebsite.postsHeading")} <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginLeft: 6 }} className="text-admin-ink-muted">{w.posts.length}</span>
            </h3>
          </div>
          <div className="flex flex-col gap-1.5">
            {w.posts.length === 0 ? (
              <EmptyState icon="info" title={t("dashboard.adminWebsite.postsEmptyTitle")} body={t("dashboard.adminWebsite.postsEmptyBody")} compact />
            ) : (
              w.posts.map(p => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!liveOrigin}
                  aria-label={interpolate(t("dashboard.adminWebsite.postsOpenAria"), { title: p.title })}
                  onClick={() => openPostOnLive(p)}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    gap: 10,
                    alignItems: "center",
                    padding: "10px 12px",
                    borderRadius: 9,
                    border: `1px solid ${COLORS.borderSoft}`,
                    background: "#fff",
                    textAlign: "left",
                    fontFamily: FONTS.body,
                    cursor: liveOrigin ? "pointer" : "not-allowed",
                    opacity: liveOrigin ? 1 : 0.65,
                    transition: `border-color ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!liveOrigin) return;
                    e.currentTarget.style.borderColor = COLORS.indigoDeep;
                    e.currentTarget.style.boxShadow = "0 2px 8px rgba(11,11,13,0.05)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = COLORS.borderSoft;
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div className="min-w-0">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <PageStatusChip status={p.status} />
                      <span className="text-admin-ink-dim text-admin-11">{p.author}</span>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink">{p.title}</div>
                    <div style={{ fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">{p.tags.join(" · ")}</div>
                  </div>
                  <div style={{ textAlign: "right" }} className="text-admin-ink-muted">
                    <div style={{ fontFamily: "ui-monospace, monospace", fontSize: 13, fontWeight: 600, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink">{(p.hits7d ?? 0).toLocaleString()}</div>
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>{t("dashboard.adminWebsite.hits7d")}</div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

      </section>
    </>
  );
}
