"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import {
  buildEditorPanelUrl,
  resolveWebsiteEditorBaseUrl,
  resolveWebsiteLiveOrigin,
} from "@/lib/admin/website-editor-links";
import { interpolate } from "@/i18n/interpolate";
import { buildPostPublicPathname, buildPublicPathname, isValidSlugPath, normalizeSlugPath } from "@/lib/cms/paths";
import { createDraftPageAction } from "@/lib/server-actions/admin-site-pages";
import { EmptyState, Icon, PrimaryButton, SecondaryButton } from "../primitives";
import { COLORS, FONTS, TRANSITION, meetsRole, useAdminShell } from "../state";
import type { WebsitePageRow, WebsitePost } from "../state";
import { CardDesignStudio } from "./CardDesignStudio";
import { ProfilePagesStudio } from "../../../profile-pages/ProfilePagesStudio";
import { PageStatusChip } from "./SitePage";
import { WebsiteHealthPanel } from "./WebsiteHealthPanel";
import { ConfigStatusRow, formatShortDate, HeroStat, WebsitePerformance } from "./WebsitePage-2";
import { WebsitePagesList } from "./WebsitePagesList";
import { groupPagesBySlug, pageGroupMatchesStatus, sortPageGroups } from "../state/website-pages-list";
import { PageHeader } from "./pages-shared";
import { useSiteShellEditorUrl } from "./use-site-shell-editor-url";
import { useWebsitePageLinks } from "./use-website-page-links";
import { useWebsiteSubnav, type WebsiteSubnavItem } from "./website-nav";


// ════════════════════════════════════════════════════════════════════
// WEBSITE
// 2026 premium site-management surface. Twelve sections (hero / performance
// / pages / posts / redirects / nav / custom code / tracking / SEO /
// domain / maintenance / announcement). Performance is the headline:
// 4 KPI tiles + funnel strip + Top performers Pages↔Talent switcher.
// See dev-handoff §27 for production wiring map per section.
// ════════════════════════════════════════════════════════════════════

/** Same host + scheme rules as legacy storefront redirects — http on lvh/local. */
/**
 * "Manage →" affordance on a section header. Hoisted to module scope rather
 * than written inline: `ratchet/no-new-inline-style` freezes new inline style
 * objects under `components/admin/shell`, and the suppression baseline counts
 * violations per file, so one new literal here would fail the lane.
 */
const MANAGE_LINK_STYLE: React.CSSProperties = {
  fontSize: 11,
  color: COLORS.indigoDeep,
  background: "transparent",
  border: "none",
  cursor: "pointer",
  fontWeight: 600,
  fontFamily: FONTS.body,
};

/** Website → Pages grid filter — matches `WebsitePageRow["status"]` plus All. */
type WebsitePagesTabId = "all" | WebsitePageRow["status"];

function WebsitePagesStatusTabs({
  active,
  onChange,
  counts,
}: {
  active: WebsitePagesTabId;
  onChange: (id: WebsitePagesTabId) => void;
  counts: Record<WebsitePagesTabId, number>;
}) {
  const t = useT();
  const tabs: { id: WebsitePagesTabId; label: string }[] = [
    { id: "all", label: t("dashboard.adminWebsite.pagesTabAll") },
    { id: "published", label: t("dashboard.adminWebsite.pagesTabLive") },
    { id: "draft", label: t("dashboard.adminWebsite.pagesTabDraft") },
    { id: "scheduled", label: t("dashboard.adminWebsite.pagesTabScheduled") },
    { id: "archived", label: t("dashboard.adminWebsite.pagesTabArchived") },
  ];
  return (
    <div
      role="group"
      aria-label={t("dashboard.adminWebsite.pagesFilterAria")}
      data-tulala-pages-status-filter
      style={{
        display: "inline-flex",
        flexWrap: "wrap",
        gap: 6,
        marginBottom: 12,
        position: "relative",
        zIndex: 1,
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 999,
        padding: 3,
        fontFamily: FONTS.body,
      }}
    >
      {tabs.map(tab => {
        const n = counts[tab.id];
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={isActive}
            aria-label={interpolate(t("dashboard.adminWebsite.pagesTabAria"), { label: tab.label, count: n })}
            onClick={() => onChange(tab.id)}
            style={{
              padding: "6px 12px",
              fontSize: 11.5,
              fontWeight: 600,
              letterSpacing: 0.15,
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              background: isActive ? "#fff" : "transparent",
              color: isActive ? COLORS.ink : COLORS.inkMuted,
              boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.06)" : "none",
              transition: "all 120ms ease",
              fontFamily: FONTS.body,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {tab.label}
            <span
              style={{
                fontVariantNumeric: "tabular-nums",
                fontSize: 10.5,
                fontWeight: 700,
                color: isActive ? COLORS.inkDim : COLORS.inkMuted,
                opacity: 0.85,
              }}
            >
              {n}
            </span>
          </button>
        );
      })}
    </div>
  );
}

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
  // Single source of truth (website-nav.ts), minus the external "Design" link:
  // a pill cannot open a new tab and read as "active" at the same time. This is
  // what finally gives mobile (rail hidden ≤720px) a way to reach the
  // destinations the strip used to omit, Redirects and Forms among them.
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
  // Operator's UI display locale — distinct from `locale` below (the site
  // CONTENT locale off useAdminShell, used for building editor page URLs).
  const dashboardLocale = useDashboardLocale();
  // t() is called inside useCallback closures below; keep a ref so we can read
  // the latest translator without listing `t` in the callbacks' dep arrays.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const router = useRouter();
  const pathname = usePathname();
  const {
    state,
    openDrawer,
    toast,
    effectiveWebsiteState,
    locale,
    tenantSlug,
    adminBasePath,
    websiteUsesLiveCms,
    bridgeTenantIdentity,
    tenantDefaultLocale,
  } = useAdminShell();
  const canEdit = meetsRole(state.role, "admin");
  // The platform network-hub's public site (tulala.digital) is managed in
  // code, not the page builder — so the builder + create are disabled here.
  const isPlatformHub =
    bridgeTenantIdentity?.kind === "hub" &&
    bridgeTenantIdentity?.planTier === "network";
  const w = effectiveWebsiteState;
  const isCardDesign = pathname?.endsWith("/website/card-design") ?? false;
  const isProfilePages = pathname?.endsWith("/website/profile-pages") ?? false;

  const [isCreatingPage, startCreatePageTransition] = useTransition();

  const [pagesTab, setPagesTab] = useState<WebsitePagesTabId>("all");

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
  const siteDesignUrl = useMemo(
    () => buildEditorPanelUrl({ editorBaseUrl, panel: "theme" }),
    [editorBaseUrl],
  );
  const openSiteDesign = useCallback(() => {
    if (!siteDesignUrl) return;
    window.open(siteDesignUrl, "_blank", "noopener,noreferrer");
  }, [siteDesignUrl]);

  // Lane 2 — entry point for the SITE SHELL surface (global header + footer).
  // Null unless the server confirms the surface is reachable for this caller,
  // so the button is never rendered as a link to a 404. See the hook.
  const siteShellUrl = useSiteShellEditorUrl();
  const openSiteShell = useCallback(() => {
    if (!siteShellUrl) return;
    window.open(siteShellUrl, "_blank", "noopener,noreferrer");
  }, [siteShellUrl]);

  // Every page URL is built at the ROW's own locale, never the shell's — see
  // use-website-page-links.ts for the 404 that rule exists to prevent.
  const notify = useCallback(
    (messageKey: string) => toast(tRef.current(messageKey)),
    [toast],
  );
  const { openPageEditor, openPageSettings, pageLiveUrl } = useWebsitePageLinks({
    editorBaseUrl,
    liveOrigin,
    fallbackLocale: locale,
    notify,
  });

  const openPostOnLive = useCallback(
    (post: WebsitePost) => {
      if (!liveOrigin) {
        toast(tRef.current("dashboard.adminWebsite.toastLiveUrlUnavailable"));
        return;
      }
      const raw = post.slug.trim().replace(/^\/+/u, "");
      const firstSegment = raw.split("/").filter(Boolean)[0] ?? "";
      const pathname = buildPostPublicPathname(locale as Locale, firstSegment);
      window.open(`${liveOrigin}${pathname}`, "_blank", "noopener,noreferrer");
      toast(tRef.current("dashboard.adminWebsite.toastOpeningPost"));
    },
    [liveOrigin, locale, toast],
  );

  const openHomepageEditor = useCallback(() => {
    if (!editorBaseUrl) {
      toast(tRef.current("dashboard.adminWebsite.toastLiveUrlUnavailable"));
      return;
    }
    window.open(`${editorBaseUrl}?edit=1&panel=sections`, "_blank", "noopener,noreferrer");
    toast(tRef.current("dashboard.adminWebsite.toastOpeningHomepageEditor"));
  }, [editorBaseUrl, toast]);

  const handleAddPage = useCallback(() => {
    if (isPlatformHub) {
      toast(tRef.current("dashboard.adminWebsite.toastSiteManagedInCode"));
      return;
    }
    startCreatePageTransition(() => {
      void (async () => {
        const res = await createDraftPageAction();
        if (!res.ok) {
          toast(res.error);
          return;
        }
        await router.refresh();
        if (!editorBaseUrl) {
          toast(tRef.current("dashboard.adminWebsite.toastDraftCreatedOpenVisual"));
          return;
        }
        const inner = normalizeSlugPath(res.slug.replace(/^\/+/u, ""));
        if (!isValidSlugPath(inner)) {
          toast(tRef.current("dashboard.adminWebsite.toastDraftCreatedOpenList"));
          return;
        }
        // Open the editor at the locale the page was CREATED at (tenant default),
        // not the operator's current UI locale — cms_pages is unique on
        // (tenant_id, locale, slug), so opening at the wrong locale 404s the
        // `/p/` underlay and the editor shows "not found".
        const pathname = buildPublicPathname((res.locale as Locale) ?? (locale as Locale), inner);
        window.open(
          `${editorBaseUrl}${pathname}?edit=1&panel=pageSettings`,
          "_blank",
          "noopener,noreferrer",
        );
        toast(tRef.current("dashboard.adminWebsite.toastOpeningVisualEditor"));
      })();
    });
  }, [
    editorBaseUrl,
    isPlatformHub,
    locale,
    router,
    startCreatePageTransition,
    toast,
  ]);

  const totals = {
    publishedPages: w.pages.filter(p => p.status === "published").length,
    draftPages: w.pages.filter(p => p.status === "draft").length,
    scheduledPages: w.pages.filter(p => p.status === "scheduled").length,
    archivedPages: w.pages.filter(p => p.status === "archived").length,
    publishedPosts: w.posts.filter(p => p.status === "published").length,
    activeRedirects: w.redirects.filter(r => r.active).length,
  };

  // Earliest upcoming fire time among scheduled pages, for the hero's
  // "Scheduled" stat sub-label. `scheduledFor` is always set on a page
  // whose derived status is "scheduled" (mergeWebsiteStateFromBridge).
  const nextScheduledAt = w.pages
    .filter(p => p.status === "scheduled" && p.scheduledFor)
    .map(p => p.scheduledFor as string)
    .sort()[0];

  // One entry per SLUG, locale variants folded in — see website-pages-list.ts
  // for why the locale dimension needs a container rather than more cards.
  const pageGroups = useMemo(
    () => sortPageGroups(groupPagesBySlug(w.pages, tenantDefaultLocale)),
    [w.pages, tenantDefaultLocale],
  );

  // The tabs count GROUPS now, not rows: an EN + ES pair is one page to the
  // operator. A group counts under every status one of its variants holds, so
  // the half-finished ES draft of a live page is findable under "Draft".
  const pagesTabCounts = useMemo(
    (): Record<WebsitePagesTabId, number> => ({
      all: pageGroups.length,
      published: pageGroups.filter(g => pageGroupMatchesStatus(g, "published")).length,
      draft: pageGroups.filter(g => pageGroupMatchesStatus(g, "draft")).length,
      scheduled: pageGroups.filter(g => pageGroupMatchesStatus(g, "scheduled")).length,
      archived: pageGroups.filter(g => pageGroupMatchesStatus(g, "archived")).length,
    }),
    [pageGroups],
  );

  const filteredGroups =
    pagesTab === "all"
      ? pageGroups
      : pageGroups.filter(g => pageGroupMatchesStatus(g, pagesTab));
  const fmtMoney = (n: number) => `€${n.toLocaleString()}`;

  if (isCardDesign) {
    return (
      <>
        <WebsiteSubviewTabs active="card-design" />
        <CardDesignStudio />
      </>
    );
  }

  if (isProfilePages) {
    return (
      <>
        <WebsiteSubviewTabs active="profile-pages" />
        <ProfilePagesStudio />
      </>
    );
  }

  return (
    <>
      <WebsiteSubviewTabs active="site" />
      <PageHeader
        title={t("dashboard.adminWebsite.title")}
        subtitle={interpolate(t("dashboard.adminWebsite.subtitle"), { domain: w.domain.primaryDomain })}
        actions={
          <>
            {!canEdit && <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">{t("dashboard.adminWebsite.readOnly")}</span>}
            <SecondaryButton
              size="sm"
              disabled={!liveOrigin}
              onClick={() => liveOrigin && window.open(liveOrigin, "_blank", "noopener,noreferrer")}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="external" size={12} stroke={1.7} /> {t("dashboard.adminWebsite.viewLive")}
              </span>
            </SecondaryButton>
            <SecondaryButton size="sm" disabled={!liveOrigin} onClick={openHomepageEditor}>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="pencil" size={12} stroke={1.7} /> {t("dashboard.adminWebsite.editHomepage")}
              </span>
            </SecondaryButton>
            {/* Site design (theme tokens: colors, fonts, spacing, shell).
                It lives in a drawer INSIDE the visual editor, which made it
                effectively undiscoverable from the admin — this is the direct
                way in. Mirrored in the sidebar's Website → Design item. */}
            <SecondaryButton size="sm" disabled={!siteDesignUrl} onClick={openSiteDesign}>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="sparkle" size={12} stroke={1.7} /> {t("dashboard.adminWebsite.siteDesign")}
              </span>
            </SecondaryButton>
            {/* Site header & footer — the global shell shared by every page.
                Rendered ONLY when the server says the surface is reachable
                (edit flag on + capability), so it is never a link to a 404. */}
            {siteShellUrl ? (
              <SecondaryButton size="sm" onClick={openSiteShell}>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="pencil" size={12} stroke={1.7} /> {t("dashboard.adminWebsite.siteShell")}
                </span>
              </SecondaryButton>
            ) : null}
            {websiteUsesLiveCms && canEdit ? (
              <PrimaryButton
                size="sm"
                disabled={!liveOrigin || isCreatingPage}
                onClick={handleAddPage}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="plus" size={12} stroke={1.7} /> {t("dashboard.adminWebsite.addPage")}
                </span>
              </PrimaryButton>
            ) : null}
          </>
        }
      />

      {/* Hero — gradient banner with URL + status + key totals */}
      <section style={{
        marginBottom: 18,
        background: `linear-gradient(135deg, ${COLORS.fill} 0%, ${COLORS.fillDeep} 100%)`,
        borderRadius: 14,
        padding: 20,
        color: "#fff",
        fontFamily: FONTS.body,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", opacity: 0.7 }}>{t("dashboard.adminWebsite.liveUrl")}</span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, fontWeight: 600 }}>{liveOrigin || "—"}</span>
          <button type="button" disabled={!liveOrigin} onClick={() => { try { navigator.clipboard.writeText(liveOrigin); } catch {} toast(t("dashboard.adminWebsite.toastCopied")); }}
            style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.30)", background: "transparent", color: "#fff", fontFamily: FONTS.body, cursor: liveOrigin ? "pointer" : "not-allowed", opacity: liveOrigin ? 1 : 0.45 }}
          >{t("dashboard.adminWebsite.copy")}</button>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: w.maintenance.enabled ? COLORS.amber : "#5BD893" }} />
            {w.maintenance.enabled ? t("dashboard.adminWebsite.inMaintenance") : t("dashboard.adminWebsite.live")}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
          <HeroStat label={t("dashboard.adminWebsite.heroPagesLive")}      value={totals.publishedPages.toString()} sub={interpolate(t("dashboard.adminWebsite.heroDraftCount"), { count: totals.draftPages })} />
          <HeroStat label={t("dashboard.adminWebsite.heroPosts")}            value={totals.publishedPosts.toString()} sub={interpolate(t("dashboard.adminWebsite.heroUnpublishedCount"), { count: w.posts.length - totals.publishedPosts })} />
          <HeroStat label={t("dashboard.adminWebsite.heroRedirects")}    value={totals.activeRedirects.toString()} sub={interpolate(t("dashboard.adminWebsite.heroPausedCount"), { count: w.redirects.length - totals.activeRedirects })} />
          <HeroStat label={t("dashboard.adminWebsite.heroScheduled")}        value={totals.scheduledPages.toString()} sub={nextScheduledAt ? interpolate(t("dashboard.adminWebsite.heroNextScheduled"), { date: formatShortDate(nextScheduledAt, dashboardLocale) }) : t("dashboard.adminWebsite.heroNone")} />
        </div>
      </section>

      {/* Server-computed findings: nothing on fixtures, one green line when well. */}
      <WebsiteHealthPanel report={w.health} />

      {/* Wave 4.1 — REMOVED the separate "Page Builder" (workspace_pages) section.
          It was an empty second page system stacked next to the real "Pages"
          list (cms_pages) below, which was the source of confusion. There is now
          ONE page system: the cms_pages "Pages" list (cards + front-end ?edit=1),
          rendered further down. The workspace_pages adapter + surface kind were
          deleted in the page-system consolidation; the empty table is dropped
          separately. */}

      {/* Performance — KPI tiles + funnel + Top performers switcher */}
      <WebsitePerformance analytics={w.analytics} pages={w.pages} fmtMoney={fmtMoney} />

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

      {/* Pages — one expandable row per slug (see WebsitePagesList). Replaced
          the card grid: cards buried state and had nowhere to put the locale
          variants that `cms_pages` unavoidably produces. */}
      <section style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }} className="text-admin-ink">{t("dashboard.adminWebsite.pagesHeading")}</h2>
          <span style={{ fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-ink-muted">
            {interpolate(t("dashboard.adminWebsite.pagesCountSummary"), { live: totals.publishedPages, draft: totals.draftPages, scheduled: totals.scheduledPages })}
            {totals.archivedPages > 0 ? interpolate(t("dashboard.adminWebsite.pagesCountArchivedSuffix"), { archived: totals.archivedPages }) : ""}
          </span>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 12, fontFamily: FONTS.body, lineHeight: 1.45 }} className="text-admin-ink-muted">
          {t("dashboard.adminWebsite.pagesHelp")}
        </p>
        {w.pages.length === 0 ? (
          <EmptyState
            icon="info"
            title={t("dashboard.adminWebsite.pagesEmptyTitle")}
            body={t("dashboard.adminWebsite.pagesEmptyBody")}
            compact
          />
        ) : (
          <>
            <WebsitePagesStatusTabs active={pagesTab} onChange={setPagesTab} counts={pagesTabCounts} />
            {filteredGroups.length === 0 ? (
              <EmptyState
                icon="info"
                title={
                  pagesTab === "draft"
                    ? t("dashboard.adminWebsite.pagesFilterEmptyDraftTitle")
                    : pagesTab === "scheduled"
                      ? t("dashboard.adminWebsite.pagesFilterEmptyScheduledTitle")
                      : pagesTab === "archived"
                        ? t("dashboard.adminWebsite.pagesFilterEmptyArchivedTitle")
                        : pagesTab === "published"
                          ? t("dashboard.adminWebsite.pagesFilterEmptyLiveTitle")
                          : t("dashboard.adminWebsite.pagesFilterEmptyDefaultTitle")
                }
                body={
                  pagesTab === "draft"
                    ? t("dashboard.adminWebsite.pagesFilterEmptyDraftBody")
                    : pagesTab === "scheduled"
                      ? t("dashboard.adminWebsite.pagesFilterEmptyScheduledBody")
                      : pagesTab === "archived"
                        ? t("dashboard.adminWebsite.pagesFilterEmptyArchivedBody")
                        : pagesTab === "published"
                          ? t("dashboard.adminWebsite.pagesFilterEmptyLiveBody")
                          : t("dashboard.adminWebsite.pagesFilterEmptyDefaultBody")
                }
                compact
              />
            ) : (
              <WebsitePagesList
                groups={filteredGroups}
                canEdit={canEdit}
                isPlatformHub={isPlatformHub}
                liveUrlFor={pageLiveUrl}
                onOpenEditor={openPageEditor}
                onOpenPageSettings={openPageSettings}
              />
            )}
          </>
        )}
      </section>

      {/* Posts + Redirects — two-column composite (breaks the visual rhythm) */}
      <section style={{ marginBottom: 22, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: 14 }}>
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

        {/* Redirects column */}
        <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, padding: 16, fontFamily: FONTS.body }}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 15, fontWeight: 600 }} className="text-admin-ink">
              {t("dashboard.adminWebsite.redirectsHeading")} <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginLeft: 6 }} className="text-admin-ink-muted">{totals.activeRedirects}/{w.redirects.length}</span>
            </h3>
            {/* This column is read-only; add / edit / import live on the
                dedicated surface. Without this link the only way in was the
                sidebar, and the panel that shows the problem was not the panel
                that could fix it. */}
            {canEdit && (
              <button
                type="button"
                onClick={() => router.push(`${adminBasePath}/website/redirects`)}
                style={MANAGE_LINK_STYLE}
              >
                {t("dashboard.adminWebsite.manageArrow")}
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            {w.redirects.length === 0 ? (
              <EmptyState icon="info" title={t("dashboard.adminWebsite.redirectsEmptyTitle")} body={t("dashboard.adminWebsite.redirectsEmptyBody")} compact />
            ) : (
              w.redirects.map(r => (
              <div key={r.id} style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${COLORS.borderSoft}`, background: r.active ? "#fff" : COLORS.surfaceAlt, opacity: r.active ? 1 : 0.7 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, fontFamily: "ui-monospace, monospace" }} className="bg-admin-indigo-soft text-admin-indigo-deep">{r.statusCode}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }} className="text-admin-ink-muted">{r.match}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, monospace", fontSize: 11, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-muted">{interpolate(t("dashboard.adminWebsite.redirectHits"), { count: (r.hits7d ?? 0).toLocaleString() })}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }} className="text-admin-ink">{r.from}</span>
                  <span style={{ flexShrink: 0 }} className="text-admin-ink-dim">→</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 1, minWidth: 0 }} className="text-admin-indigo-deep">{r.to}</span>
                </div>
              </div>
              ))
            )}
          </div>
        </div>
      </section>

      {/* Configuration — single 3-column card combining Domain / SEO / Tracking */}
      <section style={{ marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }} className="text-admin-ink">{t("dashboard.adminWebsite.configHeading")}</h2>
          <span style={{ fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-ink-muted">{t("dashboard.adminWebsite.configSubheading")}</span>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {/* Domain */}
          <div style={{ padding: 18, borderRight: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" }} className="text-admin-ink-muted">{t("dashboard.adminWebsite.domainLabel")}</span>
              {canEdit && <button type="button" onClick={() => openDrawer("domain")} style={{ fontSize: 11, color: COLORS.indigoDeep, background: "transparent", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: FONTS.body }}>{t("dashboard.adminWebsite.manageArrow")}</button>}
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: -0.3, wordBreak: "break-all", marginBottom: 12 }} className="text-admin-ink">{w.domain.primaryDomain}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <ConfigStatusRow label={t("dashboard.adminWebsite.dnsLabel")} status={w.domain.status === "verified" ? "ok" : "warn"} value={w.domain.status === "verified" ? t("dashboard.adminWebsite.dnsVerified") : t("dashboard.adminWebsite.dnsPending")} />
              <ConfigStatusRow label={t("dashboard.adminWebsite.sslLabel")} status={w.domain.sslStatus === "active" ? "ok" : "warn"} value={w.domain.sslStatus === "active" ? interpolate(t("dashboard.adminWebsite.sslActiveRenews"), { date: w.domain.sslExpiresOn ?? "—" }) : w.domain.sslStatus} />
              <ConfigStatusRow label={t("dashboard.adminWebsite.recordsLabel")} status={(w.domain.dnsRecords ?? []).every(r => r.matched) ? "ok" : "warn"} value={interpolate(t("dashboard.adminWebsite.recordsMatched"), { matched: (w.domain.dnsRecords ?? []).filter(r => r.matched).length, total: (w.domain.dnsRecords ?? []).length })} />
            </div>
          </div>

          {/* SEO */}
          <div style={{ padding: 18, borderRight: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" }} className="text-admin-ink-muted">{t("dashboard.adminWebsite.seoDefaultsLabel")}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: w.seo.robotsMode === "indexable" ? COLORS.successSoft : COLORS.amberSoft, color: w.seo.robotsMode === "indexable" ? COLORS.successDeep : COLORS.amberDeep, textTransform: "uppercase", letterSpacing: 0.5 }}>{w.seo.robotsMode === "indexable" ? t("dashboard.adminWebsite.seoIndexable") : t("dashboard.adminWebsite.seoNoIndex")}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }} className="text-admin-ink">{w.seo.siteTitle || t("dashboard.adminWebsite.notSet")}</div>
            <div style={{ fontSize: 11.5, marginBottom: 12, lineHeight: 1.45 }} className="text-admin-ink-muted">{w.seo.description || t("dashboard.adminWebsite.notSet")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span className="text-admin-ink-muted">{t("dashboard.adminWebsite.seoTitleTemplate")}</span><span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }} className="text-admin-ink">{w.seo.titleTemplate || t("dashboard.adminWebsite.notSet")}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span className="text-admin-ink-muted">{t("dashboard.adminWebsite.seoSitemap")}</span><span style={{ color: w.seo.sitemapEnabled ? COLORS.successDeep : COLORS.amberDeep, fontWeight: 600 }}>{w.seo.sitemapEnabled ? t("dashboard.adminWebsite.seoEnabled") : t("dashboard.adminWebsite.seoDisabled")}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span className="text-admin-ink-muted">{t("dashboard.adminWebsite.seoCanonical")}</span><span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }} className="text-admin-ink">{w.seo.canonicalDomain}</span></div>
            </div>
          </div>

          {/* Tracking — chip cluster */}
          <div style={{ padding: 18, fontFamily: FONTS.body }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" }} className="text-admin-ink-muted">{t("dashboard.adminWebsite.trackingLabel")}</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.5 }} className="bg-admin-indigo-soft text-admin-indigo-deep">{interpolate(t("dashboard.adminWebsite.trackingConsent"), { mode: w.tracking.cookieConsent })}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "GA4", value: w.tracking.ga4MeasurementId },
                { label: "Plausible", value: w.tracking.plausibleDomain },
                { label: "Meta", value: w.tracking.metaPixelId },
                { label: "GTM", value: w.tracking.gtmContainerId },
                { label: "Hotjar", value: w.tracking.hotjarSiteId },
                { label: "LinkedIn", value: w.tracking.linkedInPartnerId },
              ].map(tr => {
                const active = tr.value.length > 0;
                return (
                  <span key={tr.label} title={active ? tr.value : t("dashboard.adminWebsite.notConfigured")}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, background: active ? COLORS.successSoft : COLORS.surfaceAlt, border: `1px solid ${active ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`, fontSize: 11.5, fontWeight: 600, color: active ? COLORS.successDeep : COLORS.inkDim }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? COLORS.successDeep : COLORS.inkDim }} />
                    {tr.label}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
