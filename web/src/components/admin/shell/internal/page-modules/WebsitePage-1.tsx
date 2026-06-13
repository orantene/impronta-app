"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { Locale } from "@/i18n/config";
import { buildPostPublicPathname, buildPublicPathname, isValidSlugPath, normalizeSlugPath } from "@/lib/cms/paths";
import { createDraftPageAction } from "@/lib/server-actions/admin-site-pages";
import { EmptyState, Icon, PrimaryButton, SecondaryButton } from "../primitives";
import { COLORS, FONTS, TRANSITION, meetsRole, useAdminShell } from "../state";
import type { WebsitePageRow, WebsitePost } from "../state";
import { CardDesignStudio } from "./CardDesignStudio";
import { PageStatusChip } from "./SitePage";
import { ConfigStatusRow, HeroStat, PageVisualCard, WebsitePerformance } from "./WebsitePage-2";
import { PageHeader } from "./pages-shared";


// ════════════════════════════════════════════════════════════════════
// WEBSITE
// 2026 premium site-management surface. Twelve sections (hero / performance
// / pages / posts / redirects / nav / custom code / tracking / SEO /
// domain / maintenance / announcement). Performance is the headline:
// 4 KPI tiles + funnel strip + Top performers Pages↔Talent switcher.
// See dev-handoff §27 for production wiring map per section.
// ════════════════════════════════════════════════════════════════════

/** Same host + scheme rules as legacy storefront redirects — http on lvh/local. */
function resolveWebsiteLiveOrigin(
  primaryDomain: string | undefined,
  windowOriginFallback: string,
): string {
  const host = primaryDomain?.trim() ?? "";
  const proto =
    host.endsWith(".lvh.me") ||
    host.startsWith("localhost") ||
    host.startsWith("127.")
      ? "http"
      : "https";
  if (host.length > 0) return `${proto}://${host}`;
  return windowOriginFallback;
}

function isLocalWebsiteOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  } catch {
    return false;
  }
}

function resolveWebsiteEditorBaseUrl({
  liveOrigin,
  tenantSlug,
  windowOrigin,
}: {
  liveOrigin: string;
  tenantSlug: string | undefined;
  windowOrigin: string;
}): string {
  if (windowOrigin && tenantSlug && isLocalWebsiteOrigin(windowOrigin)) {
    return `${windowOrigin}/${tenantSlug}`;
  }
  return liveOrigin;
}

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
  const tabs: { id: WebsitePagesTabId; label: string }[] = [
    { id: "all", label: "All" },
    { id: "published", label: "Live" },
    { id: "draft", label: "Draft" },
    { id: "scheduled", label: "Scheduled" },
    { id: "archived", label: "Archived" },
  ];
  return (
    <div
      role="group"
      aria-label="Filter pages by publication status"
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
      {tabs.map(t => {
        const n = counts[t.id];
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={isActive}
            aria-label={`${t.label}: ${n} pages`}
            onClick={() => onChange(t.id)}
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
            {t.label}
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
  tenantSlug,
}: {
  active: "site" | "card-design";
  tenantSlug: string | undefined;
}) {
  const router = useRouter();
  const base = tenantSlug ? `/${tenantSlug}/admin/website` : "/admin/website";
  const tabs: { id: "site" | "card-design"; label: string; href: string }[] = [
    { id: "site", label: "Site", href: base },
    { id: "card-design", label: "Card Design", href: `${base}/card-design` },
  ];
  return (
    <div
      role="tablist"
      aria-label="Website sections"
      data-tulala-website-subview-tabs
      style={{
        display: "inline-flex",
        gap: 4,
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 999,
        padding: 3,
        marginBottom: 16,
        fontFamily: FONTS.body,
      }}
    >
      {tabs.map(t => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => router.push(t.href)}
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
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function WebsitePage() {
  const router = useRouter();
  const pathname = usePathname();
  const {
    state,
    openDrawer,
    toast,
    effectiveWebsiteState,
    locale,
    tenantSlug,
    websiteUsesLiveCms,
    bridgeTenantIdentity,
  } = useAdminShell();
  const canEdit = meetsRole(state.role, "admin");
  // The platform network-hub's public site (tulala.digital) is managed in
  // code, not the page builder — so the builder + create are disabled here.
  const isPlatformHub =
    bridgeTenantIdentity?.kind === "hub" &&
    bridgeTenantIdentity?.planTier === "network";
  const w = effectiveWebsiteState;
  const isCardDesign = pathname?.endsWith("/website/card-design") ?? false;

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

  const openPageVisualEditor = useCallback(
    (page: WebsitePageRow) => {
      if (!editorBaseUrl) {
        toast("Live site URL isn’t available yet — check Domain below.");
        return;
      }
      const raw = page.slug.trim();
      const inner =
        raw === "" || raw === "/"
          ? ""
          : normalizeSlugPath(raw.replace(/^\/+/u, ""));
      if (inner && !isValidSlugPath(inner)) {
        toast(
          "This URL doesn’t map to a public page path — open the live site and use ?edit=1 there.",
        );
        return;
      }
      const pathname =
        inner === "" ? "/" : buildPublicPathname(locale as Locale, inner);
      const url = `${editorBaseUrl}${pathname}?edit=1&panel=sections`;
      window.open(url, "_blank", "noopener,noreferrer");
      toast("Opening visual editor…");
    },
    [editorBaseUrl, locale, toast],
  );

  const openPostOnLive = useCallback(
    (post: WebsitePost) => {
      if (!liveOrigin) {
        toast("Live site URL isn’t available yet.");
        return;
      }
      const raw = post.slug.trim().replace(/^\/+/u, "");
      const firstSegment = raw.split("/").filter(Boolean)[0] ?? "";
      const pathname = buildPostPublicPathname(locale as Locale, firstSegment);
      window.open(`${liveOrigin}${pathname}`, "_blank", "noopener,noreferrer");
      toast("Opening post…");
    },
    [liveOrigin, locale, toast],
  );

  const openHomepageEditor = useCallback(() => {
    if (!editorBaseUrl) {
      toast("Live site URL isn’t available yet.");
      return;
    }
    window.open(`${editorBaseUrl}?edit=1&panel=sections`, "_blank", "noopener,noreferrer");
    toast("Opening homepage editor…");
  }, [editorBaseUrl, toast]);

  const handleAddPage = useCallback(() => {
    if (isPlatformHub) {
      toast("This site is managed in code — the page builder is disabled here.");
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
          toast("Draft page created — open it from the list with Visual editor.");
          return;
        }
        const inner = normalizeSlugPath(res.slug.replace(/^\/+/u, ""));
        if (!isValidSlugPath(inner)) {
          toast("Draft page created — open it from the list.");
          return;
        }
        const pathname = buildPublicPathname(locale as Locale, inner);
        window.open(
          `${editorBaseUrl}${pathname}?edit=1&panel=pageSettings`,
          "_blank",
          "noopener,noreferrer",
        );
        toast("Opening visual editor…");
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

  const pagesTabCounts = useMemo(
    (): Record<WebsitePagesTabId, number> => ({
      all: w.pages.length,
      published: totals.publishedPages,
      draft: totals.draftPages,
      scheduled: totals.scheduledPages,
      archived: totals.archivedPages,
    }),
    [
      w.pages.length,
      totals.publishedPages,
      totals.draftPages,
      totals.scheduledPages,
      totals.archivedPages,
    ],
  );

  const filteredPages =
    pagesTab === "all" ? w.pages : w.pages.filter(p => p.status === pagesTab);
  const fmtMoney = (n: number) => `€${n.toLocaleString()}`;

  if (isCardDesign) {
    return (
      <>
        <WebsiteSubviewTabs active="card-design" tenantSlug={tenantSlug} />
        <CardDesignStudio />
      </>
    );
  }

  return (
    <>
      <WebsiteSubviewTabs active="site" tenantSlug={tenantSlug} />
      <PageHeader
        title="Website"
        subtitle={`${w.domain.primaryDomain} · pages, posts, redirects, code, tracking, SEO`}
        actions={
          <>
            {!canEdit && <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }} className="text-admin-ink-muted">Read-only</span>}
            <SecondaryButton
              size="sm"
              disabled={!liveOrigin}
              onClick={() => liveOrigin && window.open(liveOrigin, "_blank", "noopener,noreferrer")}
            >
              <span className="inline-flex items-center gap-1.5">
                <Icon name="external" size={12} stroke={1.7} /> View live
              </span>
            </SecondaryButton>
            <SecondaryButton size="sm" disabled={!liveOrigin} onClick={openHomepageEditor}>
              <span className="inline-flex items-center gap-1.5">
                <Icon name="pencil" size={12} stroke={1.7} /> Edit homepage
              </span>
            </SecondaryButton>
            {websiteUsesLiveCms && canEdit ? (
              <PrimaryButton
                size="sm"
                disabled={!liveOrigin || isCreatingPage}
                onClick={handleAddPage}
              >
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="plus" size={12} stroke={1.7} /> Add page
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
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", opacity: 0.7 }}>Live URL</span>
          <span style={{ fontFamily: "ui-monospace, monospace", fontSize: 14, fontWeight: 600 }}>{liveOrigin || "—"}</span>
          <button type="button" disabled={!liveOrigin} onClick={() => { try { navigator.clipboard.writeText(liveOrigin); } catch {} toast("Copied"); }}
            style={{ fontSize: 11, padding: "3px 9px", borderRadius: 999, border: "1px solid rgba(255,255,255,0.30)", background: "transparent", color: "#fff", fontFamily: FONTS.body, cursor: liveOrigin ? "pointer" : "not-allowed", opacity: liveOrigin ? 1 : 0.45 }}
          >Copy</button>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: w.maintenance.enabled ? COLORS.amber : "#5BD893" }} />
            {w.maintenance.enabled ? "In maintenance" : "Live"}
          </span>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14 }}>
          <HeroStat label="Pages live"      value={totals.publishedPages.toString()} sub={`${totals.draftPages} draft`} />
          <HeroStat label="Posts"            value={totals.publishedPosts.toString()} sub={`${w.posts.length - totals.publishedPosts} unpublished`} />
          <HeroStat label="301 redirects"    value={totals.activeRedirects.toString()} sub={`${w.redirects.length - totals.activeRedirects} paused`} />
          <HeroStat label="Scheduled"        value={totals.scheduledPages.toString()} sub={totals.scheduledPages > 0 ? "next: SS27" : "none"} />
        </div>
      </section>

      {/* Wave 4.1 — RETIRED the separate "Page Builder" (workspace_pages) section.
          It was an empty second page system stacked next to the real "Pages"
          list (cms_pages) below, which is the source of confusion. There is now
          ONE page system: the cms_pages "Pages" list (cards + front-end ?edit=1),
          rendered further down. workspace_pages remains in the schema/adapter for
          now but is no longer surfaced here. (WorkspacePageBuilderSurface import
          intentionally dropped.) */}

      {/* Performance — KPI tiles + funnel + Top performers switcher */}
      <WebsitePerformance analytics={w.analytics} pages={w.pages} fmtMoney={fmtMoney} />

      {/* Site banners — only render if any are active (Maintenance + Announcement collapsed) */}
      {(w.maintenance.enabled || w.announcement.enabled) && (
        <section style={{ marginBottom: 18, display: "flex", flexDirection: "column", gap: 8 }}>
          {w.maintenance.enabled && (
            <div style={{ padding: "12px 16px", borderRadius: 12, border: `1px solid ${COLORS.amberDeep}33`, display: "flex", alignItems: "center", gap: 12, fontFamily: FONTS.body }} className="bg-admin-amber-soft">
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS.amberDeep, flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase" }} className="text-admin-amber-deep">Maintenance mode active</div>
                <div style={{ fontSize: 13, marginTop: 2 }} className="text-admin-ink">{w.maintenance.message}</div>
              </div>
              <button type="button" onClick={() => { try { navigator.clipboard.writeText(w.maintenance.bypassToken); } catch {} toast("Bypass token copied"); }}
                style={{ fontSize: 11, padding: "5px 10px", borderRadius: 7, border: `1px solid ${COLORS.amberDeep}55`, background: "#fff", color: COLORS.amberDeep, fontWeight: 600, cursor: "pointer", fontFamily: FONTS.body, flexShrink: 0 }}>Copy bypass</button>
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

      {/* Pages — visual card grid (the hero asset, not a table) */}
      <section style={{ marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }} className="text-admin-ink">Pages</h2>
          <span style={{ fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-ink-muted">
            {totals.publishedPages} live · {totals.draftPages} draft · {totals.scheduledPages} scheduled
            {totals.archivedPages > 0 ? ` · ${totals.archivedPages} archived` : ""}
          </span>
        </div>
        <p style={{ margin: "0 0 12px", fontSize: 12, fontFamily: FONTS.body, lineHeight: 1.45 }} className="text-admin-ink-muted">
          Click a page to open the visual editor on your live site (<span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }}>?edit=1</span>
          ). Hits below are placeholder until analytics bridge to this surface.
        </p>
        {w.pages.length === 0 ? (
          <EmptyState
            icon="info"
            title="No pages yet"
            body="Pages from your workspace will appear here once the CMS lists them for this tenant."
            compact
          />
        ) : (
          <>
            <WebsitePagesStatusTabs active={pagesTab} onChange={setPagesTab} counts={pagesTabCounts} />
            {filteredPages.length === 0 ? (
              <EmptyState
                icon="info"
                title={
                  pagesTab === "draft"
                    ? "No draft pages"
                    : pagesTab === "scheduled"
                      ? "Nothing scheduled"
                      : pagesTab === "archived"
                        ? "No archived pages"
                        : pagesTab === "published"
                          ? "No live pages"
                          : "No pages"
                }
                body={
                  pagesTab === "draft"
                    ? "Drafts you save before publishing will appear here."
                    : pagesTab === "scheduled"
                      ? "Pages with a future publish time show under Scheduled."
                      : pagesTab === "archived"
                        ? "Archived pages are hidden from the live site but stay in your workspace."
                        : pagesTab === "published"
                          ? "Publish a draft or pick another tab."
                          : "Try another filter."
                }
                compact
              />
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
                {(() => {
                  const maxHits = Math.max(...filteredPages.map(p => p.hits7d ?? 0), 1);
                  return filteredPages.map(p => (
                    <PageVisualCard
                      key={p.id}
                      page={p}
                      maxHits={maxHits}
                      onClick={() => openPageVisualEditor(p)}
                    />
                  ));
                })()}
              </div>
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
              Posts <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginLeft: 6 }} className="text-admin-ink-muted">{w.posts.length}</span>
            </h3>
          </div>
          <div className="flex flex-col gap-1.5">
            {w.posts.length === 0 ? (
              <EmptyState icon="info" title="No posts" body="Blog posts will list here when present." compact />
            ) : (
              w.posts.map(p => (
                <button
                  key={p.id}
                  type="button"
                  disabled={!liveOrigin}
                  aria-label={`Open post on live site: ${p.title}`}
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
                    <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>hits 7d</div>
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
              Redirects <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", marginLeft: 6 }} className="text-admin-ink-muted">{totals.activeRedirects}/{w.redirects.length}</span>
            </h3>
          </div>
          <div className="flex flex-col gap-1.5">
            {w.redirects.length === 0 ? (
              <EmptyState icon="info" title="No redirects" body="URL redirects will appear here when configured." compact />
            ) : (
              w.redirects.map(r => (
              <div key={r.id} style={{ padding: "9px 12px", borderRadius: 9, border: `1px solid ${COLORS.borderSoft}`, background: r.active ? "#fff" : COLORS.surfaceAlt, opacity: r.active ? 1 : 0.7 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 999, fontFamily: "ui-monospace, monospace" }} className="bg-admin-indigo-soft text-admin-indigo-deep">{r.statusCode}</span>
                  <span style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }} className="text-admin-ink-muted">{r.match}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "ui-monospace, monospace", fontSize: 11, fontVariantNumeric: "tabular-nums" }} className="text-admin-ink-muted">{(r.hits7d ?? 0).toLocaleString()} hits</span>
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
          <h2 style={{ margin: 0, fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: -0.2 }} className="text-admin-ink">Configuration</h2>
          <span style={{ fontSize: 11.5, fontFamily: FONTS.body }} className="text-admin-ink-muted">Domain · SEO · Tracking</span>
        </div>
        <div style={{ background: "#fff", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 14, overflow: "hidden", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
          {/* Domain */}
          <div style={{ padding: 18, borderRight: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body, position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" }} className="text-admin-ink-muted">Domain</span>
              {canEdit && <button type="button" onClick={() => openDrawer("domain")} style={{ fontSize: 11, color: COLORS.indigoDeep, background: "transparent", border: "none", cursor: "pointer", fontWeight: 600, fontFamily: FONTS.body }}>Manage →</button>}
            </div>
            <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: -0.3, wordBreak: "break-all", marginBottom: 12 }} className="text-admin-ink">{w.domain.primaryDomain}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              <ConfigStatusRow label="DNS" status={w.domain.status === "verified" ? "ok" : "warn"} value={w.domain.status === "verified" ? "Verified" : "Pending"} />
              <ConfigStatusRow label="SSL" status={w.domain.sslStatus === "active" ? "ok" : "warn"} value={w.domain.sslStatus === "active" ? `Active · renews ${w.domain.sslExpiresOn ?? "—"}` : w.domain.sslStatus} />
              <ConfigStatusRow label="Records" status={(w.domain.dnsRecords ?? []).every(r => r.matched) ? "ok" : "warn"} value={`${(w.domain.dnsRecords ?? []).filter(r => r.matched).length}/${(w.domain.dnsRecords ?? []).length} matched`} />
            </div>
          </div>

          {/* SEO */}
          <div style={{ padding: 18, borderRight: `1px solid ${COLORS.borderSoft}`, fontFamily: FONTS.body }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" }} className="text-admin-ink-muted">SEO defaults</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, background: w.seo.robotsMode === "indexable" ? COLORS.successSoft : COLORS.amberSoft, color: w.seo.robotsMode === "indexable" ? COLORS.successDeep : COLORS.amberDeep, textTransform: "uppercase", letterSpacing: 0.5 }}>{w.seo.robotsMode === "indexable" ? "Indexable" : "No-index"}</span>
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }} className="text-admin-ink">{w.seo.siteTitle}</div>
            <div style={{ fontSize: 11.5, marginBottom: 12, lineHeight: 1.45 }} className="text-admin-ink-muted">{w.seo.description}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span className="text-admin-ink-muted">Title template</span><span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "60%" }} className="text-admin-ink">{w.seo.titleTemplate}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span className="text-admin-ink-muted">Sitemap</span><span style={{ color: w.seo.sitemapEnabled ? COLORS.successDeep : COLORS.amberDeep, fontWeight: 600 }}>{w.seo.sitemapEnabled ? "Enabled" : "Disabled"}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span className="text-admin-ink-muted">Canonical</span><span style={{ fontFamily: "ui-monospace, monospace", fontSize: 11 }} className="text-admin-ink">{w.seo.canonicalDomain}</span></div>
            </div>
          </div>

          {/* Tracking — chip cluster */}
          <div style={{ padding: 18, fontFamily: FONTS.body }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" }} className="text-admin-ink-muted">Tracking</span>
              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 999, textTransform: "uppercase", letterSpacing: 0.5 }} className="bg-admin-indigo-soft text-admin-indigo-deep">Consent: {w.tracking.cookieConsent}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { label: "GA4", value: w.tracking.ga4MeasurementId },
                { label: "Plausible", value: w.tracking.plausibleDomain },
                { label: "Meta", value: w.tracking.metaPixelId },
                { label: "GTM", value: w.tracking.gtmContainerId },
                { label: "Hotjar", value: w.tracking.hotjarSiteId },
                { label: "LinkedIn", value: w.tracking.linkedInPartnerId },
              ].map(t => {
                const active = t.value.length > 0;
                return (
                  <span key={t.label} title={active ? t.value : "Not configured"}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "5px 10px", borderRadius: 999, background: active ? COLORS.successSoft : COLORS.surfaceAlt, border: `1px solid ${active ? "rgba(46,125,91,0.30)" : COLORS.borderSoft}`, fontSize: 11.5, fontWeight: 600, color: active ? COLORS.successDeep : COLORS.inkDim }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: active ? COLORS.successDeep : COLORS.inkDim }} />
                    {t.label}
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
