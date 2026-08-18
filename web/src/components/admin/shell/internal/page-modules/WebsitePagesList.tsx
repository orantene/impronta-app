"use client";

/**
 * WebsitePagesList.tsx — the admin Website → Pages list.
 *
 * WHAT REPLACED WHAT, AND WHY
 * ───────────────────────────
 * This surface used to be a grid of browser-chrome mockup cards, one card per
 * `cms_pages` row. Two problems, both structural:
 *
 *   1. A card buries state. Status, freshness, traffic and search visibility
 *      all competed for the same 260px, so the answer to "which page is not
 *      live?" required reading every tile.
 *   2. `cms_pages` is unique on `(tenant_id, locale, slug)`. A bilingual tenant
 *      has TWO rows for one page, and the grid showed them as two unrelated
 *      pages. There is no card layout that fixes that; the locale dimension
 *      needs a container.
 *
 * So: a single-column list of expandable rows, which a novice reads like a
 * table of contents. One row per SLUG (see `groupPagesBySlug`), collapsed to
 * the four facts that answer "is this page fine?" — title, status, traffic,
 * freshness — with everything else one click away.
 *
 * EXPANDING IS SAFE
 * ─────────────────
 * The whole row toggles the panel; it never navigates. The editor opens only
 * from the explicit Edit button (and from the panel's own links), which is why
 * that button stops propagation. In the old grid the entire card was a link to
 * the editor, so there was no way to look at a page without opening it.
 *
 * STYLING
 * ───────
 * Admin Tailwind tokens only. `ratchet/no-new-inline-style` freezes new inline
 * `style={{…}}` objects anywhere under `components/admin/shell`, and a moved
 * style counts as a new one — so nothing was carried over from the card.
 *
 * SCOPE
 * ─────
 * The row itself stays read-only. The expanded panel's "More actions" region is
 * filled by `WebsitePageActions` (P3-A), which owns every page-changing call;
 * keeping it in its own module is what holds this file under the 800-line cap
 * and keeps the reading rules and the writing rules apart.
 */

import { useCallback, useId, useState } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";

import { Icon } from "../primitives";
import type { WebsitePageRow } from "../state";
import {
  derivePageVisibilityNotes,
  type WebsitePageGroup,
} from "../state/website-pages-list";
import { PageStatusChip } from "./SitePage";
import { WebsitePageActions } from "./WebsitePageActions";
import { formatPageUpdatedAt, formatScheduledPublishAt, formatShortDate } from "./WebsitePage-2";

type PagesListProps = {
  groups: readonly WebsitePageGroup[];
  /**
   * Render at most this many rows. Overview's preview passes 5; the Pages
   * surface passes nothing. The truncation lives HERE rather than at the call
   * site so there is one list component and no second copy of a row.
   */
  limit?: number;
  /** Role gate — below `admin` the editor affordances are not offered. */
  canEdit: boolean;
  /** The platform hub's own site is managed in code, not the page builder. */
  isPlatformHub: boolean;
  /** Public URL for a specific variant, or null when no live origin is known. */
  liveUrlFor: (page: WebsitePageRow) => string | null;
  /** Opens the visual editor at THAT variant's locale. */
  onOpenEditor: (page: WebsitePageRow) => void;
  /** Opens the editor's pageSettings panel for THAT variant. */
  onOpenPageSettings: (page: WebsitePageRow) => void;
};

/**
 * Visit counts are null-honest all the way from `groupTopPages`: `undefined`
 * means "this page was not in the analytics top 8", NOT "nobody visited it".
 * Rendering that as "0 visits" would be the app inventing a fact, so an unknown
 * count is simply not shown in the collapsed row, and is named as unknown in
 * the panel. A real 0 still renders as 0.
 */
function hasVisitCount(value: number | undefined): value is number {
  return typeof value === "number";
}

/** EN / ES chips — only ever rendered when a slug has more than one variant. */
function LocaleChips({ locales }: { locales: readonly string[] }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-[4px]">
      {locales.map((loc) => (
        <span
          key={loc}
          className="rounded-admin-sm bg-admin-indigo-soft px-[6px] py-px text-admin-10 font-semibold uppercase tracking-[0.5px] text-admin-indigo-deep"
        >
          {loc}
        </span>
      ))}
    </span>
  );
}

/** One search-visibility fact plus the way to change it. */
function VisibilityNote({
  label,
  actionLabel,
  onAction,
}: {
  label: string;
  actionLabel: string;
  onAction?: () => void;
}) {
  return (
    <li className="flex flex-wrap items-baseline gap-x-[8px] gap-y-[2px]">
      <span className="text-admin-12h text-admin-ink">{label}</span>
      {onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="cursor-pointer border-none bg-transparent p-0 text-admin-11h font-semibold text-admin-indigo-deep underline underline-offset-2"
        >
          {actionLabel}
        </button>
      ) : null}
    </li>
  );
}

function PagesListRow({
  group,
  expanded,
  onToggle,
  panelId,
  canEdit,
  isPlatformHub,
  liveUrlFor,
  onOpenEditor,
  onOpenPageSettings,
}: {
  group: WebsitePageGroup;
  expanded: boolean;
  onToggle: () => void;
  panelId: string;
} & Omit<PagesListProps, "groups">) {
  const t = useT();
  const dashboardLocale = useDashboardLocale();
  const page = group.primary;
  const showEditor = canEdit && !isPlatformHub;
  const multiLocale = group.variants.length > 1;
  const notes = derivePageVisibilityNotes(page);
  const liveUrl = page.status === "published" ? liveUrlFor(page) : null;
  const fixLabel = t("dashboard.adminWebsite.pagesListSearchFix");

  return (
    <div
      className={`overflow-hidden rounded-admin-lg border bg-admin-card ${
        expanded ? "border-admin-border-strong" : "border-admin-border-soft"
      }`}
    >
      <div className="flex items-stretch gap-[8px] pr-[10px]">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          aria-label={interpolate(
            t(
              expanded
                ? "dashboard.adminWebsite.pagesListCollapseAria"
                : "dashboard.adminWebsite.pagesListExpandAria",
            ),
            { title: page.title },
          )}
          className="flex min-h-[56px] min-w-0 flex-1 cursor-pointer items-center gap-[10px] border-none bg-transparent px-[12px] py-[8px] text-left"
        >
          <span className="shrink-0 text-admin-ink-dim">
            <Icon name={expanded ? "chevron-down" : "chevron-right"} size={14} />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="flex flex-wrap items-center gap-x-[8px] gap-y-[3px]">
              <span className="truncate text-admin-13 font-semibold text-admin-ink">
                {page.title}
              </span>
              <span className="truncate font-mono text-admin-11 text-admin-ink-muted">
                {group.slug}
              </span>
              {group.isHomepage ? (
                <span className="shrink-0 rounded-admin-sm bg-admin-accent-soft px-[7px] py-px text-admin-10 font-semibold uppercase tracking-[0.5px] text-admin-accent-deep">
                  {t("dashboard.adminWebsite.pagesListHomepage")}
                </span>
              ) : null}
              <PageStatusChip status={group.status} />
              {multiLocale ? <LocaleChips locales={group.locales} /> : null}
            </span>
            <span className="flex flex-wrap items-center gap-x-[10px] gap-y-[2px] text-admin-11 text-admin-ink-muted">
              {page.status === "scheduled" && page.scheduledFor ? (
                <span className="font-semibold text-admin-indigo-deep">
                  {formatScheduledPublishAt(page.scheduledFor, t, dashboardLocale)}
                </span>
              ) : null}
              {hasVisitCount(page.hits7d) ? (
                <span className="tabular-nums">
                  {interpolate(t("dashboard.adminWebsite.pagesListVisits7d"), {
                    count: page.hits7d.toLocaleString(),
                  })}
                </span>
              ) : null}
              <span>
                {formatPageUpdatedAt(page.updatedAt, t, dashboardLocale)}
                {page.lastEditedBy
                  ? ` · ${interpolate(t("dashboard.adminWebsite.byAuthor"), {
                      name: page.lastEditedBy,
                    })}`
                  : ""}
              </span>
            </span>
          </span>
        </button>
        {showEditor ? (
          <span className="flex shrink-0 items-center">
            <button
              type="button"
              onClick={(event) => {
                // Never let the editor open as a side effect of looking at a
                // row: the row toggles, this button navigates.
                event.stopPropagation();
                onOpenEditor(page);
              }}
              aria-label={interpolate(t("dashboard.adminWebsite.pageCardOpenAria"), {
                title: page.title,
                slug: group.slug,
              })}
              className="cursor-pointer rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-12h font-semibold text-admin-ink"
            >
              {t("dashboard.adminWebsite.pagesListEdit")}
            </button>
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div
          id={panelId}
          className="flex flex-col gap-[14px] border-t border-admin-border-soft bg-admin-surface-alt px-[16px] py-[14px]"
        >
          {/* Where to go from here */}
          <div className="flex flex-wrap items-center gap-[8px]">
            {liveUrl ? (
              <a
                href={liveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[10px] py-[5px] text-admin-12h font-semibold text-admin-ink no-underline"
              >
                <Icon name="external" size={12} stroke={1.7} />
                {t("dashboard.adminWebsite.viewLive")}
              </a>
            ) : null}
            {showEditor ? (
              <button
                type="button"
                onClick={() => onOpenEditor(page)}
                className="inline-flex cursor-pointer items-center gap-[5px] rounded-admin-md border border-admin-border bg-admin-card px-[10px] py-[5px] text-admin-12h font-semibold text-admin-ink"
              >
                <Icon name="pencil" size={12} stroke={1.7} />
                {t("dashboard.adminWebsite.pagesListOpenEditor")}
              </button>
            ) : null}
            {page.publishedAt ? (
              <span className="text-admin-11h text-admin-ink-muted">
                {interpolate(t("dashboard.adminWebsite.pagesListPublishedOn"), {
                  date: formatShortDate(page.publishedAt, dashboardLocale),
                })}
              </span>
            ) : null}
          </div>

          {/* Per-locale variants. Each editor link is built at THAT row's
              locale: `cms_pages` is unique on (tenant_id, locale, slug), so
              opening an ES variant at the shell's EN locale 404s the `/p/`
              underlay and the editor reports "not found". */}
          {multiLocale ? (
            <div className="flex flex-col gap-[6px]">
              <div className="text-admin-10 font-semibold uppercase tracking-[0.6px] text-admin-ink-muted">
                {t("dashboard.adminWebsite.pagesListLanguagesHeading")}
              </div>
              <ul className="m-0 flex list-none flex-col gap-[4px] p-0">
                {group.variants.map((variant) => {
                  const variantLocale = (variant.locale ?? "").toUpperCase();
                  return (
                    <li
                      key={variant.id}
                      className="flex flex-wrap items-center gap-[8px] rounded-admin-md border border-admin-border-soft bg-admin-card px-[10px] py-[7px]"
                    >
                      <span className="rounded-admin-sm bg-admin-indigo-soft px-[6px] py-px text-admin-10 font-semibold uppercase tracking-[0.5px] text-admin-indigo-deep">
                        {variantLocale}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-admin-12h text-admin-ink">
                        {variant.title}
                      </span>
                      <PageStatusChip status={variant.status} />
                      {showEditor ? (
                        <button
                          type="button"
                          onClick={() => onOpenEditor(variant)}
                          aria-label={interpolate(
                            t("dashboard.adminWebsite.pagesListVariantOpenAria"),
                            { locale: variantLocale, title: variant.title },
                          )}
                          className="cursor-pointer border-none bg-transparent p-0 text-admin-11h font-semibold text-admin-indigo-deep underline underline-offset-2"
                        >
                          {t("dashboard.adminWebsite.pagesListOpenEditor")}
                        </button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/* Search visibility — FACTS, not errors. `noindex` is frequently
              deliberate, so each line states what is true and offers the
              control that changes it. Derived from the default-locale variant,
              which is the one the collapsed row describes. */}
          <div className="flex flex-col gap-[6px]">
            <div className="text-admin-10 font-semibold uppercase tracking-[0.6px] text-admin-ink-muted">
              {t("dashboard.adminWebsite.pagesListSearchHeading")}
            </div>
            {notes.length === 0 ? (
              <div className="text-admin-12h text-admin-ink-muted">
                {t("dashboard.adminWebsite.pagesListSearchAllGood")}
              </div>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-[4px] p-0">
                {notes.map((note) => (
                  <VisibilityNote
                    key={note.id}
                    label={t(note.messageKey)}
                    actionLabel={fixLabel}
                    onAction={showEditor ? () => onOpenPageSettings(page) : undefined}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Traffic */}
          <div className="flex flex-wrap gap-[18px]">
            <div className="flex flex-col gap-[2px]">
              <span className="text-admin-10 font-semibold uppercase tracking-[0.6px] text-admin-ink-muted">
                {t("dashboard.adminWebsite.pagesListVisitsLabel7d")}
              </span>
              <span className="text-admin-13 font-semibold tabular-nums text-admin-ink">
                {hasVisitCount(page.hits7d)
                  ? page.hits7d.toLocaleString()
                  : t("dashboard.adminWebsite.pagesListVisitsNoData")}
              </span>
            </div>
            <div className="flex flex-col gap-[2px]">
              <span className="text-admin-10 font-semibold uppercase tracking-[0.6px] text-admin-ink-muted">
                {t("dashboard.adminWebsite.pagesListVisitsLabel30d")}
              </span>
              <span className="text-admin-13 font-semibold tabular-nums text-admin-ink">
                {hasVisitCount(page.hits30d)
                  ? page.hits30d.toLocaleString()
                  : t("dashboard.adminWebsite.pagesListVisitsNoData")}
              </span>
            </div>
          </div>

          {/* Publish / rename / duplicate / set as homepage / archive /
              restore / delete. Which of those appear is decided by
              `derivePageActions`, not here — see WebsitePageActions.tsx. */}
          <WebsitePageActions
            group={group}
            canEdit={canEdit}
            isPlatformHub={isPlatformHub}
          />
        </div>
      ) : null}
    </div>
  );
}

export function WebsitePagesList({
  groups,
  limit,
  canEdit,
  isPlatformHub,
  liveUrlFor,
  onOpenEditor,
  onOpenPageSettings,
}: PagesListProps) {
  // One row open at a time — a plain conditional render, deliberately not a
  // Radix collapsible: the panel is static content, and an animation library
  // here would buy nothing but bundle weight in a surface that already carries
  // the whole Website page.
  const [expandedSlug, setExpandedSlug] = useState<string | null>(null);
  const idPrefix = useId();

  const toggle = useCallback((slug: string) => {
    setExpandedSlug((current) => (current === slug ? null : slug));
  }, []);

  const visible = typeof limit === "number" ? groups.slice(0, limit) : groups;

  return (
    <div className="flex flex-col gap-[6px]">
      {visible.map((group) => {
        const panelId = `${idPrefix}-${group.slug}`;
        return (
          <PagesListRow
            key={group.slug}
            group={group}
            expanded={expandedSlug === group.slug}
            onToggle={() => toggle(group.slug)}
            panelId={panelId}
            canEdit={canEdit}
            isPlatformHub={isPlatformHub}
            liveUrlFor={liveUrlFor}
            onOpenEditor={onOpenEditor}
            onOpenPageSettings={onOpenPageSettings}
          />
        );
      })}
    </div>
  );
}
