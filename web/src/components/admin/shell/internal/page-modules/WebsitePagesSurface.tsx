"use client";

/**
 * WebsitePagesSurface.tsx — the Website → Pages destination, plus the compact
 * preview Overview shows in its place.
 *
 * WHY IT MOVED (P4-A)
 * ───────────────────
 * The whole pages inventory — status filter strip, one expandable row per slug,
 * every empty state — used to live at the bottom of Overview. That is why
 * Overview could never be short: the surface an operator opens every day also
 * carried the full list, so "what should I do next?" was always below the fold.
 *
 * Pages now has its own route (`/website/pages`, a `PageRouteSyncer` stub like
 * every other Website sub-view) and Overview shows `WebsitePagesPreview`: the
 * first few rows of the SAME sorted, grouped data, plus a link here.
 *
 * ONE SORT, ONE ROW COMPONENT
 * ───────────────────────────
 * Both exports build their groups through `groupPagesBySlug` + `sortPageGroups`
 * and render them with `WebsitePagesList`. Nothing about a row is written twice,
 * so the preview and the full list can never disagree about order, status, or
 * what a row says.
 *
 * STYLING — token classes only. `ratchet/no-new-inline-style` freezes new inline
 * `style={{…}}` under `components/admin/shell`, and a MOVED style counts as a
 * new one, so the status filter strip was rebuilt on tokens rather than carried
 * over from Overview.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { Locale } from "@/i18n/config";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { buildPublicPathname, isValidSlugPath, normalizeSlugPath } from "@/lib/cms/paths";
import {
  resolveWebsiteEditorBaseUrl,
  resolveWebsiteLiveOrigin,
} from "@/lib/admin/website-editor-links";
import { createDraftPageAction } from "@/lib/server-actions/admin-site-pages";

import { EmptyState, Icon } from "../primitives";
import { meetsRole, useAdminShell } from "../state";
import type { WebsitePageRow } from "../state";
import {
  groupPagesBySlug,
  pageGroupMatchesStatus,
  sortPageGroups,
} from "../state/website-pages-list";
import { PageHeader } from "./pages-shared";
import { useWebsitePageLinks } from "./use-website-page-links";
import { WebsitePagesList } from "./WebsitePagesList";

/** How many rows Overview shows before handing off to the full list. */
const PREVIEW_ROWS = 5;

/** Website → Pages filter — matches `WebsitePageRow["status"]` plus All. */
type WebsitePagesTabId = "all" | WebsitePageRow["status"];

/**
 * Everything both the full page and the preview need, resolved once. Kept as a
 * hook rather than props so each export can be dropped in on its own — the
 * preview renders inside Overview, the page renders from the route dispatch,
 * and neither has to thread the other's plumbing.
 */
function useWebsitePagesSurface() {
  const t = useT();
  // t() is read inside useCallback closures; a ref keeps the latest translator
  // reachable without listing `t` in their dependency arrays.
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);
  const router = useRouter();
  const {
    state,
    toast,
    effectiveWebsiteState,
    locale,
    tenantSlug,
    websiteUsesLiveCms,
    bridgeTenantIdentity,
    tenantDefaultLocale,
  } = useAdminShell();
  const canEdit = meetsRole(state.role, "admin");
  // The platform network-hub's public site is managed in code, not the page
  // builder, so create is refused there — see `handleAddPage`.
  const isPlatformHub =
    bridgeTenantIdentity?.kind === "hub" && bridgeTenantIdentity?.planTier === "network";
  const w = effectiveWebsiteState;

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

  const [isCreatingPage, startCreatePageTransition] = useTransition();
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
        // Open the editor at the locale the page was CREATED at (tenant
        // default), not the operator's UI locale — cms_pages is unique on
        // (tenant_id, locale, slug), so the wrong locale 404s the `/p/`
        // underlay and the editor reports "not found".
        const pathname = buildPublicPathname((res.locale as Locale) ?? (locale as Locale), inner);
        window.open(`${editorBaseUrl}${pathname}?edit=1&panel=pageSettings`, "_blank", "noopener,noreferrer");
        toast(tRef.current("dashboard.adminWebsite.toastOpeningVisualEditor"));
      })();
    });
  }, [editorBaseUrl, isPlatformHub, locale, router, startCreatePageTransition, toast]);

  // One entry per SLUG, locale variants folded in — see website-pages-list.ts
  // for why the locale dimension needs a container rather than more cards.
  const groups = useMemo(
    () => sortPageGroups(groupPagesBySlug(w.pages, tenantDefaultLocale)),
    [w.pages, tenantDefaultLocale],
  );

  return {
    canEdit,
    groups,
    handleAddPage,
    isCreatingPage,
    isPlatformHub,
    // Unchanged gate: the button appears on live CMS + admin role, and the
    // hub refusal is a toast from `handleAddPage`, not a hidden control.
    showAddPage: websiteUsesLiveCms && canEdit,
    liveUrlFor: pageLiveUrl,
    onOpenEditor: openPageEditor,
    onOpenPageSettings: openPageSettings,
    pages: w.pages,
  };
}

/** "Add page" — same affordance on Overview's preview and on the full page. */
function AddPageButton({ busy, onClick }: { busy: boolean; onClick: () => void }) {
  const t = useT();
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onClick}
      className="inline-flex shrink-0 cursor-pointer items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-12h font-semibold text-admin-ink disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Icon name="plus" size={12} stroke={1.7} />
      {t("dashboard.adminWebsite.addPage")}
    </button>
  );
}

function PagesStatusTabs({
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
      className="mb-[12px] inline-flex flex-wrap gap-[6px] rounded-full border border-admin-border-soft bg-admin-surface-alt p-[3px]"
    >
      {tabs.map((tab) => {
        const n = counts[tab.id];
        const isActive = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={isActive}
            aria-label={interpolate(t("dashboard.adminWebsite.pagesTabAria"), {
              label: tab.label,
              count: n,
            })}
            onClick={() => onChange(tab.id)}
            className={`inline-flex cursor-pointer items-center gap-[6px] rounded-full border-none px-[12px] py-[6px] text-admin-11h font-semibold ${
              isActive ? "bg-admin-card text-admin-ink" : "bg-transparent text-admin-ink-muted"
            }`}
          >
            {tab.label}
            <span
              className={`text-admin-10h font-bold tabular-nums ${
                isActive ? "text-admin-ink-dim" : "text-admin-ink-muted"
              }`}
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
 * The empty state for a filter that matched nothing — one per tab.
 *
 * The keys are written out as literals, never composed from `tab`: the dashboard
 * catalog guard (`message-key-usage.static.test.ts`) can only prove a key is
 * read when it can see the key.
 */
function FilterEmptyState({ tab }: { tab: WebsitePagesTabId }) {
  const t = useT();
  const copy =
    tab === "draft"
      ? {
          title: t("dashboard.adminWebsite.pagesFilterEmptyDraftTitle"),
          body: t("dashboard.adminWebsite.pagesFilterEmptyDraftBody"),
        }
      : tab === "scheduled"
        ? {
            title: t("dashboard.adminWebsite.pagesFilterEmptyScheduledTitle"),
            body: t("dashboard.adminWebsite.pagesFilterEmptyScheduledBody"),
          }
        : tab === "archived"
          ? {
              title: t("dashboard.adminWebsite.pagesFilterEmptyArchivedTitle"),
              body: t("dashboard.adminWebsite.pagesFilterEmptyArchivedBody"),
            }
          : tab === "published"
            ? {
                title: t("dashboard.adminWebsite.pagesFilterEmptyLiveTitle"),
                body: t("dashboard.adminWebsite.pagesFilterEmptyLiveBody"),
              }
            : {
                title: t("dashboard.adminWebsite.pagesFilterEmptyDefaultTitle"),
                body: t("dashboard.adminWebsite.pagesFilterEmptyDefaultBody"),
              };
  return <EmptyState icon="info" title={copy.title} body={copy.body} compact />;
}

/**
 * Overview's compact stand-in for the list: the first `PREVIEW_ROWS` groups of
 * the shared sort, the same row component, and the two things an operator wants
 * from Overview — a way to add a page and a way to see the rest.
 */
export function WebsitePagesPreview() {
  const t = useT();
  const router = useRouter();
  const { adminBasePath } = useAdminShell();
  const {
    canEdit,
    groups,
    handleAddPage,
    isCreatingPage,
    isPlatformHub,
    showAddPage,
    liveUrlFor,
    onOpenEditor,
    onOpenPageSettings,
    pages,
  } = useWebsitePagesSurface();

  return (
    <section className="mb-[22px]">
      <div className="mb-[8px] flex flex-wrap items-center gap-x-[10px] gap-y-[6px]">
        <h2 className="m-0 font-admin-display text-admin-17 font-semibold tracking-[-0.2px] text-admin-ink">
          {t("dashboard.adminWebsite.pagesHeading")}
        </h2>
        <span className="min-w-0 flex-1 text-admin-11h text-admin-ink-muted">
          {t("dashboard.adminWebsite.pagesPreviewHelper")}
        </span>
        {showAddPage ? <AddPageButton busy={isCreatingPage} onClick={handleAddPage} /> : null}
        <button
          type="button"
          onClick={() => router.push(`${adminBasePath}/website/pages`)}
          className="inline-flex shrink-0 cursor-pointer items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-12h font-semibold text-admin-ink"
        >
          <Icon name="arrow-right" size={12} stroke={1.7} />
          {t("dashboard.adminWebsite.pagesPreviewSeeAll")}
        </button>
      </div>
      {pages.length === 0 ? (
        <EmptyState
          icon="info"
          title={t("dashboard.adminWebsite.pagesEmptyTitle")}
          body={t("dashboard.adminWebsite.pagesEmptyBody")}
          compact
        />
      ) : (
        <>
          <WebsitePagesList
            groups={groups}
            limit={PREVIEW_ROWS}
            canEdit={canEdit}
            isPlatformHub={isPlatformHub}
            liveUrlFor={liveUrlFor}
            onOpenEditor={onOpenEditor}
            onOpenPageSettings={onOpenPageSettings}
          />
          {groups.length > PREVIEW_ROWS ? (
            <p className="m-0 mt-[8px] text-admin-11h text-admin-ink-muted">
              {interpolate(t("dashboard.adminWebsite.pagesPreviewRemaining"), {
                count: groups.length - PREVIEW_ROWS,
              })}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/** Website → Pages. The full inventory, with the status filter strip. */
export function WebsitePagesPage() {
  const t = useT();
  const {
    canEdit,
    groups,
    handleAddPage,
    isCreatingPage,
    isPlatformHub,
    showAddPage,
    liveUrlFor,
    onOpenEditor,
    onOpenPageSettings,
    pages,
  } = useWebsitePagesSurface();
  const [tab, setTab] = useState<WebsitePagesTabId>("all");

  // The tabs count GROUPS, not rows: an EN + ES pair is one page to the
  // operator. A group counts under every status one of its variants holds, so
  // the half-finished ES draft of a live page is findable under "Draft".
  const counts = useMemo(
    (): Record<WebsitePagesTabId, number> => ({
      all: groups.length,
      published: groups.filter((g) => pageGroupMatchesStatus(g, "published")).length,
      draft: groups.filter((g) => pageGroupMatchesStatus(g, "draft")).length,
      scheduled: groups.filter((g) => pageGroupMatchesStatus(g, "scheduled")).length,
      archived: groups.filter((g) => pageGroupMatchesStatus(g, "archived")).length,
    }),
    [groups],
  );

  const filtered =
    tab === "all" ? groups : groups.filter((g) => pageGroupMatchesStatus(g, tab));

  return (
    <>
      <PageHeader
        title={t("dashboard.adminWebsite.pagesHeading")}
        subtitle={t("dashboard.adminWebsite.pagesPageSubtitle")}
        actions={
          showAddPage ? <AddPageButton busy={isCreatingPage} onClick={handleAddPage} /> : undefined
        }
      />
      {pages.length === 0 ? (
        <EmptyState
          icon="info"
          title={t("dashboard.adminWebsite.pagesEmptyTitle")}
          body={t("dashboard.adminWebsite.pagesEmptyBody")}
          compact
        />
      ) : (
        <>
          <p className="m-0 mb-[12px] text-admin-12h leading-relaxed text-admin-ink-muted">
            {t("dashboard.adminWebsite.pagesHelp")}
          </p>
          <PagesStatusTabs active={tab} onChange={setTab} counts={counts} />
          {filtered.length === 0 ? (
            <FilterEmptyState tab={tab} />
          ) : (
            <WebsitePagesList
              groups={filtered}
              canEdit={canEdit}
              isPlatformHub={isPlatformHub}
              liveUrlFor={liveUrlFor}
              onOpenEditor={onOpenEditor}
              onOpenPageSettings={onOpenPageSettings}
            />
          )}
        </>
      )}
    </>
  );
}
