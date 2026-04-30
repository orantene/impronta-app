"use client";

/**
 * EditTopBar — mission control bar for the canvas editor.
 *
 * Implements builder-experience.html surface §1 (Top bar — mission control).
 * Last reconciled: 2026-04-25.
 *
 * Layout (left to right):
 *   Brand mark → divider → page picker → save status → divider →
 *   undo/redo → [spacer] → viewport switcher → [spacer] →
 *   page-settings · revisions · preview · share → divider →
 *   Save draft · Publish split-button → divider → Exit
 *
 * Visual language: 54px glass bar, warm-white tint, hairline border —
 * tokens, heights, radii, shadows all match the mockup §1 spec.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { exitEditModeAction } from "@/lib/site-admin/edit-mode/server";
import { localeMetadata } from "@/i18n/config";
import {
  listPagesForPickerAction,
  duplicatePageAction,
  type PagePickerItem,
} from "@/app/(dashboard)/admin/site-settings/pages/actions";
import type { EditDevice } from "./edit-context";
import { CHROME } from "./kit";

// Platform default locale — when the URL has no locale prefix the storefront
// resolves this. Must match the static fallback in `@/i18n/config`. Dynamic
// per-tenant defaults aren't surfaced into the editor today; the cost of
// mis-routing during a dirty draft (briefly land on a sibling locale) is
// strictly milder than threading `getLanguageSettings()` into a client tree.
const DEFAULT_LOCALE_FOR_PATH = "en";

function stripKnownLocalePrefix(
  pathname: string,
  knownLocales: ReadonlyArray<string>,
): string {
  const p = pathname.startsWith("/") ? pathname : `/${pathname}`;
  const seg = p.split("/")[1] ?? "";
  if (knownLocales.includes(seg)) {
    const rest = p.slice(`/${seg}`.length);
    return rest === "" ? "/" : rest;
  }
  return p;
}

function pathForLocale(
  pathname: string,
  newLocale: string,
  knownLocales: ReadonlyArray<string>,
): string {
  const stripped = stripKnownLocalePrefix(pathname, knownLocales);
  if (newLocale === DEFAULT_LOCALE_FOR_PATH) return stripped;
  return stripped === "/" ? `/${newLocale}` : `/${newLocale}${stripped}`;
}

/**
 * Build the destination URL for a locale switch. Preserves the active
 * search string (e.g. `?edit=1`, share-link query, ad UTM) and hash so a
 * mid-edit locale flip doesn't drop into the visitor view or lose scroll
 * anchors. Only the pathname segment moves between locales.
 */
function urlForLocale(
  pathname: string,
  search: string,
  hash: string,
  newLocale: string,
  knownLocales: ReadonlyArray<string>,
): string {
  const path = pathForLocale(pathname, newLocale, knownLocales);
  const q = search ? (search.startsWith("?") ? search : `?${search}`) : "";
  const h = hash ? (hash.startsWith("#") ? hash : `#${hash}`) : "";
  return `${path}${q}${h}`;
}

const TOPBAR_H = 54;

// ── helpers ──────────────────────────────────────────────────────────────────

function TbDivider() {
  return (
    <span
      aria-hidden
      className="shrink-0"
      style={{
        width: 1,
        height: 24,
        background: CHROME.lineStrong,
        margin: "0 6px",
        opacity: 0.5,
      }}
    />
  );
}

interface TbIconBtnProps {
  title: string;
  ariaLabel?: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: number;
  children: React.ReactNode;
}

function TbIconBtn({
  title,
  ariaLabel,
  onClick,
  disabled,
  badge,
  children,
}: TbIconBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
      className="relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[8px] border border-transparent transition-colors disabled:cursor-not-allowed"
      style={{
        width: 36,
        height: 36,
        background: "transparent",
        color: CHROME.muted,
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = CHROME.paper2;
          e.currentTarget.style.color = CHROME.ink;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = disabled ? CHROME.muted3 : CHROME.muted;
      }}
    >
      {children}
      {badge != null && badge > 0 ? (
        <span
          aria-hidden
          className="pointer-events-none absolute right-[1px] top-[1px] inline-flex min-w-[14px] items-center justify-center rounded-[7px] px-[3px] text-[9px] font-bold text-white"
          style={{
            height: 14,
            background: CHROME.rose,
            border: `1.5px solid ${CHROME.surface}`,
          }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

// ── sub-components ────────────────────────────────────────────────────────────

function BrandMark() {
  return (
    <div className="inline-flex shrink-0 items-center gap-[10px] pr-3">
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[7px] text-[12px] font-bold text-white"
        style={{
          width: 26,
          height: 26,
          // 2026-04-29 — brand mark uses the indigo accent gradient,
          // not ink-black. Ties the mark to the accent family.
          background: `linear-gradient(135deg, ${CHROME.accent2} 0%, ${CHROME.accent} 100%)`,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.15), 0 1px 3px rgba(0,0,0,0.12)",
        }}
        aria-hidden
      >
        T
      </span>
      <span
        className="text-[13px] font-bold tracking-[-0.01em]"
        style={{ color: CHROME.ink }}
      >
        Tulala
      </span>
    </div>
  );
}

/**
 * PagePicker — popover surfacing the current page + a route to the multi-
 * page manager. Mockup surface §24 (Pages picker).
 *
 * Today the editor only edits a single page (the homepage), so the
 * popover is intentionally light: it surfaces the current page row with
 * a check, plus a "Manage pages…" link that takes the operator to the
 * admin pages list. When multi-page editing lands, this is the surface
 * that will host the full picker — for now it makes the button do
 * something instead of being an inert visual.
 */
function PagePicker({
  title,
  pageId: currentPageId,
  dirty,
}: {
  title: string;
  pageId?: string | null;
  dirty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<PagePickerItem[] | null>(null);
  const [loadingPages, setLoadingPages] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const router = useRouter();

  // Reset page list when popover closes so it always re-fetches on next open
  // (picks up pages created/renamed in another tab or from Manage pages).
  useEffect(() => {
    if (!open) {
      setPages(null);
      setFetchErr(null);
    }
  }, [open]);

  // Lazy-fetch when opened.
  useEffect(() => {
    if (!open || pages !== null || loadingPages) return;
    setLoadingPages(true);
    listPagesForPickerAction()
      .then((result) => {
        if (result.ok) setPages(result.pages);
        else {
          setFetchErr(result.error);
          setPages([]);
        }
      })
      .catch(() => {
        setFetchErr("Failed to load pages.");
        setPages([]);
      })
      .finally(() => setLoadingPages(false));
  }, [open, pages, loadingPages]);

  // Outside-click dismiss — same pattern as PublishSplitButton.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-page-picker]")) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function navToPage(slug: string) {
    if (dirty && !confirm("You have unsaved changes. Leave this page?")) return;
    setOpen(false);
    router.push(slug === "" ? "/?edit=1" : `/${slug}?edit=1`);
  }

  async function handleDuplicate(sourceId: string) {
    setDuplicatingId(sourceId);
    try {
      const result = await duplicatePageAction(sourceId);
      if (result.ok) {
        setOpen(false);
        router.push(`/admin/site-settings/pages/${result.id}`);
      } else {
        setPages(null); // re-fetch on next open
        setFetchErr(result.error);
      }
    } finally {
      setDuplicatingId(null);
    }
  }

  return (
    <div className="relative shrink-0" data-page-picker>
      {/* ── Trigger ── */}
      <button
        type="button"
        title="Switch page"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex shrink-0 cursor-pointer items-center gap-[7px] rounded-[7px] border border-transparent transition-colors"
        style={{
          padding: "5px 9px 5px 11px",
          fontSize: 12.5,
          fontWeight: 500,
          color: CHROME.ink,
          background: open ? CHROME.paper2 : "transparent",
          borderColor: open ? CHROME.line : "transparent",
        }}
        onMouseEnter={(e) => {
          if (!open) {
            e.currentTarget.style.background = CHROME.paper2;
            e.currentTarget.style.borderColor = CHROME.line;
          }
        }}
        onMouseLeave={(e) => {
          if (!open) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.borderColor = "transparent";
          }
        }}
      >
        <span
          className="inline-flex shrink-0 items-center justify-center rounded-[4px]"
          style={{ width: 18, height: 18, background: CHROME.paper2, color: CHROME.muted }}
          aria-hidden
        >
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </span>
        <span className="font-semibold tracking-[-0.005em]" style={{ color: CHROME.ink }}>
          {title || "Homepage"}
        </span>
        <span style={{ color: CHROME.muted2 }} aria-hidden>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute left-0 top-[42px] z-[120] min-w-[280px] rounded-[10px] p-[6px]"
          style={{
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            boxShadow:
              "0 24px 64px -16px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(24,24,27,0.07)",
          }}
        >
          {/* ── Header ── */}
          <div
            style={{
              padding: "6px 10px 4px",
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: "0.06em",
              textTransform: "uppercase",
              color: CHROME.muted,
            }}
          >
            Pages
          </div>

          {/* ── Add new page ── */}
          <Link
            href="/admin/site-settings/pages/new"
            target="_blank"
            role="menuitem"
            className="flex cursor-pointer items-center gap-[8px] rounded-[6px] px-[10px] py-[7px] no-underline transition-colors"
            style={{ color: CHROME.blue }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = CHROME.blueBg;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            onClick={() => setOpen(false)}
          >
            <span
              className="inline-flex shrink-0 items-center justify-center rounded-[4px]"
              style={{ width: 18, height: 18, background: CHROME.blueBg, color: CHROME.blue }}
              aria-hidden
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </span>
            <span className="flex-1 font-semibold tracking-[-0.005em]" style={{ fontSize: 12.5 }}>
              Add new page
            </span>
          </Link>

          {/* ── Divider ── */}
          <div aria-hidden style={{ height: 1, background: CHROME.line, margin: "6px 2px" }} />

          {/* ── Loading / error / empty states ── */}
          {loadingPages && (
            <div className="px-[10px] py-[8px]" style={{ fontSize: 12, color: CHROME.muted }}>
              Loading…
            </div>
          )}
          {fetchErr && !loadingPages && (
            <div className="px-[10px] py-[8px]" style={{ fontSize: 12, color: CHROME.rose }}>
              {fetchErr}
            </div>
          )}
          {pages && pages.length === 0 && !loadingPages && !fetchErr && (
            <div className="px-[10px] py-[8px]" style={{ fontSize: 12, color: CHROME.muted }}>
              No pages yet.
            </div>
          )}

          {/* ── Page list ── */}
          {pages &&
            pages.map((page) => {
              const isCurrent = page.id === currentPageId;
              const isDuplicating = duplicatingId === page.id;
              return (
                <div
                  key={page.id}
                  role="menuitemradio"
                  aria-checked={isCurrent}
                  className="group flex items-center gap-[2px] rounded-[6px] px-[4px] py-[2px] transition-colors"
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.background = CHROME.paper2;
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.background = isCurrent
                      ? CHROME.paper2
                      : "transparent";
                  }}
                  style={{ background: isCurrent ? CHROME.paper2 : "transparent" }}
                >
                  {/* Nav button (spans most of the row) */}
                  <button
                    type="button"
                    className="flex flex-1 items-center gap-[8px] rounded-[4px] py-[5px] pl-[6px]"
                    style={{
                      fontSize: 12.5,
                      color: CHROME.ink,
                      cursor: isCurrent ? "default" : "pointer",
                      background: "transparent",
                      border: "none",
                    }}
                    onClick={() => {
                      if (!isCurrent) navToPage(page.slug);
                    }}
                    disabled={isCurrent}
                  >
                    <span
                      className="inline-flex shrink-0 items-center justify-center rounded-[4px]"
                      style={{
                        width: 18,
                        height: 18,
                        background: CHROME.surface,
                        color: CHROME.muted,
                      }}
                      aria-hidden
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                    </span>
                    <span
                      className="flex-1 truncate text-left font-medium tracking-[-0.005em]"
                      style={{ maxWidth: 148 }}
                    >
                      {page.title}
                    </span>
                    {page.status === "draft" && (
                      <span
                        className="shrink-0 rounded-[3px] px-[5px] py-[1px] text-[9px] font-semibold uppercase tracking-[0.05em]"
                        style={{
                          background: CHROME.amberBg,
                          color: CHROME.amber,
                          border: `1px solid ${CHROME.amberLine}`,
                        }}
                      >
                        Draft
                      </span>
                    )}
                    {isCurrent && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={CHROME.green} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>

                  {/* Edit icon — navigate to this page in the editor */}
                  <button
                    type="button"
                    title={`Edit "${page.title}"`}
                    className="inline-flex shrink-0 items-center justify-center rounded-[5px] opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ width: 24, height: 24, color: CHROME.muted }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = CHROME.ink;
                      (e.currentTarget as HTMLElement).style.background = CHROME.paper3;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color = CHROME.muted;
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                    onClick={() => navToPage(page.slug)}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>

                  {/* Duplicate icon */}
                  <button
                    type="button"
                    title={`Duplicate "${page.title}"`}
                    disabled={isDuplicating}
                    className="inline-flex shrink-0 items-center justify-center rounded-[5px] opacity-0 transition-opacity group-hover:opacity-100"
                    style={{ width: 24, height: 24, color: CHROME.muted }}
                    onClick={() => void handleDuplicate(page.id)}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.color = CHROME.ink;
                      (e.currentTarget as HTMLElement).style.background = CHROME.paper3;
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.color = CHROME.muted;
                      (e.currentTarget as HTMLElement).style.background = "transparent";
                    }}
                  >
                    {isDuplicating ? (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin" aria-hidden>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                    )}
                  </button>
                </div>
              );
            })}

          {/* ── Footer: Manage pages link ── */}
          <div aria-hidden style={{ height: 1, background: CHROME.line, margin: "6px 2px" }} />
          <Link
            href="/admin/site-settings/pages"
            role="menuitem"
            className="flex cursor-pointer items-center gap-[8px] rounded-[6px] px-[10px] py-[7px] no-underline transition-colors"
            style={{ color: CHROME.text }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = CHROME.paper2;
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
            }}
            onClick={() => setOpen(false)}
          >
            <span
              className="inline-flex shrink-0 items-center justify-center rounded-[4px]"
              style={{ width: 18, height: 18, background: CHROME.paper2, color: CHROME.muted }}
              aria-hidden
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 6h18M3 12h18M3 18h18" />
              </svg>
            </span>
            <span className="flex-1 font-semibold tracking-[-0.005em]" style={{ fontSize: 12.5 }}>
              Manage pages…
            </span>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={CHROME.muted2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="7" y1="17" x2="17" y2="7" />
              <polyline points="7 7 17 7 17 17" />
            </svg>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

function SaveStatus({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  const [justSaved, setJustSaved] = useState(false);
  const wasSavingRef = useRef(false);

  useEffect(() => {
    if (wasSavingRef.current && !saving && !dirty) {
      setJustSaved(true);
      const t = setTimeout(() => setJustSaved(false), 1600);
      wasSavingRef.current = saving;
      return () => clearTimeout(t);
    }
    wasSavingRef.current = saving;
  }, [saving, dirty]);

  const dot = "inline-block shrink-0 rounded-full";

  if (saving) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-[6px] rounded-full border text-[11px] font-semibold"
        style={{
          padding: "4px 11px 4px 9px",
          background: CHROME.blueBg,
          color: CHROME.blue,
          borderColor: CHROME.blueLine,
        }}
      >
        <span
          className={`${dot} animate-pulse`}
          style={{ width: 6, height: 6, background: CHROME.blue, boxShadow: "0 0 8px rgba(58,123,255,0.6)" }}
          aria-hidden
        />
        Saving…
      </span>
    );
  }
  if (dirty) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-[6px] rounded-full border text-[11px] font-semibold"
        style={{
          padding: "4px 11px 4px 9px",
          background: CHROME.amberBg,
          color: CHROME.amber,
          borderColor: CHROME.amberLine,
        }}
      >
        <span
          className={dot}
          style={{ width: 6, height: 6, background: CHROME.amber, boxShadow: "0 0 8px rgba(180,83,9,0.6)" }}
          aria-hidden
        />
        Unsaved
      </span>
    );
  }
  if (justSaved) {
    return (
      <span
        className="inline-flex shrink-0 items-center gap-[6px] rounded-full border text-[11px] font-semibold"
        style={{
          padding: "4px 11px 4px 9px",
          background: CHROME.greenBg,
          color: CHROME.green,
          borderColor: CHROME.greenLine,
        }}
      >
        <span
          className={dot}
          style={{ width: 6, height: 6, background: CHROME.green, boxShadow: "0 0 8px rgba(20,115,46,0.6)" }}
          aria-hidden
        />
        Saved
      </span>
    );
  }
  return (
    <span
      className="inline-flex shrink-0 items-center gap-[6px] rounded-full border text-[11px] font-semibold"
      style={{
        padding: "4px 11px 4px 9px",
        background: CHROME.greenBg,
        color: CHROME.green,
        borderColor: CHROME.greenLine,
        opacity: 0.7,
      }}
    >
      <span
        className={dot}
        style={{ width: 6, height: 6, background: CHROME.green }}
        aria-hidden
      />
      Saved
    </span>
  );
}

const VIEWPORT_OPTS: ReadonlyArray<{
  key: EditDevice;
  label: string;
  icon: React.ReactNode;
}> = [
  {
    key: "desktop",
    label: "Desktop",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    key: "tablet",
    label: "Tablet",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="2" width="16" height="20" rx="2" />
      </svg>
    ),
  },
  {
    key: "mobile",
    label: "Mobile",
    icon: (
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="7" y="2" width="10" height="20" rx="2" />
      </svg>
    ),
  },
];

/**
 * Locale switcher pill — visible only when the active tenant publishes more
 * than one locale. Clicking a non-active code navigates to the equivalent
 * URL on that locale; the storefront re-renders, EditChromeMount re-resolves
 * the locale, and EditProvider remounts with the new value (so the homepage
 * row for that locale loads). When the operator has unsaved edits we warn
 * before navigating so a hot draft on the previous locale isn't dropped.
 */
function LocaleSwitcher({
  activeLocale,
  availableLocales,
  dirty,
}: {
  activeLocale: string;
  availableLocales: ReadonlyArray<string>;
  dirty: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname() ?? "/";
  const knownLocales = useMemo(
    () => Array.from(new Set([...availableLocales, "en"])),
    [availableLocales],
  );
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);
  // `isPending` reflects React 19 transition state — true from the moment
  // we kick the navigation off until the new route's RSC payload is in.
  // We surface it as a subtle pulse on the active pill so the operator
  // gets immediate feedback that their click registered, even on a slow
  // tenant where the homepage row takes a beat to load.
  const [isPending, startTransition] = useTransition();

  const navigateToLocale = useCallback(
    (code: string) => {
      if (code === activeLocale) return;
      if (dirty) {
        const ok = window.confirm(
          "Switch locale with unsaved edits?\n\nYour current draft is auto-saved per locale on the server, so it won't be lost — when you come back it will still be here. The canvas will reload to show the draft for the other locale.",
        );
        if (!ok) return;
      }
      const search = typeof window !== "undefined" ? window.location.search : "";
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const target = urlForLocale(pathname, search, hash, code, knownLocales);
      const doNavigate = () =>
        startTransition(() => {
          router.push(target);
        });
      // Browser-native View Transitions: when supported, the swap from
      // the old composition to the new locale's composition crossfades
      // instead of flashing. Falls back to a hard swap on Safari < 18,
      // older Firefox, etc. Wrapping `startTransition` inside the view-
      // transition callback keeps both the pending state AND the visual
      // animation tied to the same navigation.
      if (
        typeof document !== "undefined" &&
        typeof (document as Document & {
          startViewTransition?: (cb: () => void) => unknown;
        }).startViewTransition === "function"
      ) {
        (
          document as Document & {
            startViewTransition: (cb: () => void) => unknown;
          }
        ).startViewTransition(doNavigate);
      } else {
        doNavigate();
      }
    },
    [activeLocale, dirty, knownLocales, pathname, router],
  );

  // Arrow-key navigation: ←/→ cycle through locales. Operators using a
  // bilingual roster spend a lot of time here; one keystroke beats two
  // mouse moves. Wraps at the ends. We avoid hijacking arrow keys when
  // an inputtable element has focus (handled by the topbar-level keymap
  // already) — the radio group's buttons are non-text targets, so this
  // handler only fires when one of the chips owns focus.
  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (availableLocales.length < 2) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const idx = availableLocales.indexOf(activeLocale);
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      const next =
        availableLocales[
          (idx + dir + availableLocales.length) % availableLocales.length
        ];
      if (next) navigateToLocale(next);
    },
    [activeLocale, availableLocales, navigateToLocale],
  );

  if (availableLocales.length < 2) return null;

  return (
    <div
      className="inline-flex shrink-0 items-center rounded-full p-[3px]"
      style={{
        background: "rgba(0,0,0,0.05)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)",
      }}
      role="radiogroup"
      aria-label="Editing locale"
      onKeyDown={handleKey}
    >
      {availableLocales.map((code, i) => {
        const meta = localeMetadata[code];
        const label = meta?.label ?? code.toUpperCase();
        const active = code === activeLocale;
        const showPending = active && isPending;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            aria-busy={showPending || undefined}
            tabIndex={active ? 0 : -1}
            disabled={isPending && !active}
            ref={(el) => {
              buttonsRef.current[i] = el;
            }}
            title={`Edit homepage in ${label} (←/→ to cycle)`}
            onClick={() => navigateToLocale(code)}
            className="inline-flex items-center gap-[5px] rounded-full border-none px-[11px] py-[5px] text-[12px] font-semibold uppercase tracking-[0.04em] transition-all"
            style={{
              background: active ? CHROME.surface : "transparent",
              color: active ? CHROME.ink : CHROME.muted,
              boxShadow: active
                ? "0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)"
                : "none",
              cursor: active
                ? "default"
                : isPending
                  ? "wait"
                  : "pointer",
              opacity: isPending && !active ? 0.5 : showPending ? 0.7 : 1,
              transition:
                "opacity 200ms ease, background 200ms ease, color 200ms ease",
            }}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}

function ViewportSwitcher({
  device,
  setDevice,
}: {
  device: EditDevice;
  setDevice: (d: EditDevice) => void;
}) {
  return (
    <div
      className="inline-flex shrink-0 items-center rounded-full p-[3px]"
      style={{
        background: "rgba(0,0,0,0.05)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)",
      }}
    >
      {VIEWPORT_OPTS.map((opt) => {
        const active = device === opt.key;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => setDevice(opt.key)}
            title={opt.label}
            className="inline-flex items-center gap-[5px] rounded-full border-none px-[13px] py-[5px] text-[12px] font-semibold tracking-[-0.005em] transition-all"
            style={{
              background: active ? CHROME.surface : "transparent",
              color: active ? CHROME.ink : CHROME.muted,
              boxShadow: active
                ? "0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)"
                : "none",
              cursor: "pointer",
            }}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * PreviewToggle — pill-style switch that flips the canvas between
 * "editing" mode (rings, drag chips, hover pills) and "preview" mode
 * (interactive page, no overlays).
 *
 * Visual treatment matches the viewport switcher (rounded pill, soft
 * inset background) so the two segmented controls read as paired
 * canvas controls. The active state uses an indigo ink to distinguish
 * "preview is on" at a glance — a ghosted-page-eye glyph signals the
 * concept without requiring a label change.
 */
function PreviewToggle({
  previewing,
  setPreviewing,
}: {
  previewing: boolean;
  setPreviewing: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => setPreviewing(!previewing)}
      title={
        previewing
          ? "Exit preview — show editing tools"
          : "Preview — hide editing tools and interact with the page"
      }
      aria-pressed={previewing}
      className="ml-2 inline-flex shrink-0 items-center gap-[6px] rounded-full border-none px-[12px] py-[5px] text-[12px] font-semibold tracking-[-0.005em] transition-all"
      style={{
        background: previewing
          ? "rgba(99, 102, 241, 0.12)"
          : "rgba(0,0,0,0.05)",
        color: previewing ? "#3d4f7c" : CHROME.muted,
        boxShadow: previewing
          ? "inset 0 0 0 1px rgba(99,102,241,0.28)"
          : "inset 0 0 0 1px rgba(0,0,0,0.04)",
      }}
    >
      {previewing ? (
        // Eye-off — "currently in preview, click to return"
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" y1="2" x2="22" y2="22" />
        </svg>
      ) : (
        // Eye — "click to preview"
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
      {previewing ? "Editing off" : "Preview"}
    </button>
  );
}

function TbTextBtn({
  children,
  onClick,
  disabled,
  title,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit" | "reset";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex shrink-0 cursor-pointer items-center gap-[6px] rounded-[8px] border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        height: 36,
        padding: "0 14px",
        fontSize: 13,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        color: CHROME.text2,
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = CHROME.paper2;
          e.currentTarget.style.color = CHROME.ink;
          e.currentTarget.style.borderColor = CHROME.line;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = CHROME.text2;
        e.currentTarget.style.borderColor = "transparent";
      }}
    >
      {children}
    </button>
  );
}

type PublishMenuOption = "schedule" | "save-draft" | "discard";

function PublishSplitButton({
  onPublish,
  onMenuSelect,
  disabled,
}: {
  onPublish: () => void;
  onMenuSelect: (opt: PublishMenuOption) => void;
  disabled?: boolean;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-publish-split]")) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  return (
    <div className="relative shrink-0" data-publish-split>
      <div
        className="inline-flex items-stretch overflow-hidden rounded-[8px]"
        style={{
          height: 36,
          // Sprint 3.2 — primary CTA uses the operator-chrome slate accent
          // instead of CHROME.ink. Black-brand tenants no longer end up
          // with a Publish button that disappears into the storefront, and
          // the slate reads as a calm, premium primary action distinct
          // from the blue we reserve for drop indicators / focus rings.
          background: `linear-gradient(180deg, ${CHROME.accent2} 0%, ${CHROME.accent} 100%)`,
          boxShadow:
            "0 1px 2px rgba(15,19,32,0.20), inset 0 0 0 1px rgba(255,255,255,0.10), inset 0 1px 0 rgba(255,255,255,0.10)",
        }}
      >
        <button
          type="button"
          onClick={onPublish}
          disabled={disabled}
          className="cursor-pointer border-none text-[13px] font-semibold tracking-[-0.005em] text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ padding: "0 16px", background: "transparent" }}
        >
          Publish
        </button>
        <span
          aria-hidden
          style={{ width: 1, background: "rgba(255,255,255,0.18)" }}
        />
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="Publish options"
          className="inline-flex cursor-pointer items-center justify-center border-none transition hover:bg-white/10"
          style={{
            width: 32,
            background: "transparent",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
      </div>

      {menuOpen ? (
        <div
          className="absolute right-0 top-[42px] z-[120] min-w-[240px] rounded-[10px] p-[6px] text-[12.5px]"
          style={{
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            boxShadow:
              "0 24px 64px -16px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(24,24,27,0.07)",
          }}
        >
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            }
            title="Schedule publish…"
            description="Choose a date and time"
            onClick={() => { onMenuSelect("schedule"); setMenuOpen(false); }}
          />
          <div
            aria-hidden
            style={{ height: 1, background: CHROME.line, margin: "4px 2px" }}
          />
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            }
            title="Save as named draft…"
            description="Checkpoint without publishing"
            shortcut="⌘S"
            onClick={() => { onMenuSelect("save-draft"); setMenuOpen(false); }}
          />
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="2" x2="22" y2="6" />
                <path d="M7.5 20.5 19 9l-4-4L3.5 16.5z" />
              </svg>
            }
            title="Discard draft"
            description="Revert to the live version"
            onClick={() => { onMenuSelect("discard"); setMenuOpen(false); }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon,
  title,
  description,
  shortcut,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  shortcut?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className="flex cursor-pointer items-center gap-[10px] rounded-[6px] px-[10px] py-[8px] transition-colors"
      style={{ color: CHROME.text }}
      onClick={onClick}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.background = CHROME.paper2;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
      role="menuitem"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick?.();
      }}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[5px]"
        style={{
          width: 24,
          height: 24,
          background: CHROME.paper2,
          color: CHROME.ink,
        }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="flex-1">
        <span className="block font-semibold tracking-[-0.005em]" style={{ color: CHROME.ink, fontSize: 12.5 }}>
          {title}
        </span>
        <span className="block" style={{ fontSize: 11, color: CHROME.muted, marginTop: 1 }}>
          {description}
        </span>
      </span>
      {shortcut ? (
        <span
          className="shrink-0 rounded-[3px] border px-[5px] py-[2px] font-mono"
          style={{
            fontSize: 10.5,
            color: CHROME.muted2,
            background: CHROME.paper2,
            borderColor: CHROME.line,
          }}
        >
          {shortcut}
        </span>
      ) : null}
    </div>
  );
}

/**
 * MoreMenu — overflow popover that hosts the secondary topbar actions.
 *
 * The 2026-04-28 compression sprint pulled five dedicated icon buttons
 * (Page settings · Revisions · Theme · Assets · Share) out of the
 * topbar and into this single popover. Comments + Preview stayed
 * surfaced — Comments because it carries a badge, Preview because it
 * is the highest-frequency secondary action.
 *
 * Each entry calls the open-handler the topbar already received from
 * EditShell; if a handler is missing, the row renders disabled. The
 * Share row spawns an inline mini-form (label + TTL + Generate) so
 * the operator never leaves the popover to mint a link.
 */
function MoreMenu({
  onPageSettings,
  onRevisions,
  onTheme,
  onAssets,
  onShare,
}: {
  onPageSettings?: () => void;
  onRevisions?: () => void;
  onTheme?: () => void;
  onAssets?: () => void;
  onShare?: (opts: {
    label?: string;
    ttlSeconds?: number;
  }) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareLabel, setShareLabel] = useState("");
  const [shareTtl, setShareTtl] =
    useState<(typeof SHARE_TTL_CHOICES)[number]["id"]>(SHARE_TTL_DEFAULT);
  const [shareBusy, setShareBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-more-menu]")) {
        setOpen(false);
        setShareOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setShareOpen(false);
      setShareLabel("");
      setShareTtl(SHARE_TTL_DEFAULT);
    }
  }, [open]);

  function handlePick(cb?: () => void) {
    if (!cb) return;
    cb();
    setOpen(false);
  }

  async function handleGenerateShare() {
    if (!onShare || shareBusy) return;
    setShareBusy(true);
    try {
      const ttlSeconds = SHARE_TTL_CHOICES.find((c) => c.id === shareTtl)
        ?.seconds;
      const url = await onShare({
        label: shareLabel.trim() || undefined,
        ttlSeconds,
      });
      if (!url) return;
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(url);
        } catch {
          window.prompt("Share link", url);
        }
      }
      setOpen(false);
    } finally {
      setShareBusy(false);
    }
  }

  return (
    <div className="relative shrink-0" data-more-menu>
      <TbIconBtn
        title="More actions"
        ariaLabel="More actions"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none" />
        </svg>
      </TbIconBtn>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-[44px] z-[120] min-w-[260px] rounded-[10px] p-[6px]"
          style={{
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            boxShadow:
              "0 24px 64px -16px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(24,24,27,0.07)",
          }}
        >
          {!shareOpen ? (
            <>
              <MoreRow
                disabled={!onPageSettings}
                onClick={() => handlePick(onPageSettings)}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                }
                label="Page settings"
                hint="SEO, social, routing"
              />
              <MoreRow
                disabled={!onRevisions}
                onClick={() => handlePick(onRevisions)}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
                    <path d="M3 3v5h5" />
                    <path d="M12 7v5l3 2" />
                  </svg>
                }
                label="Revisions"
                hint="Snapshot history"
              />
              <MoreRow
                disabled={!onTheme}
                onClick={() => handlePick(onTheme)}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 4-4 4h-2a2 2 0 0 0-2 2 2 2 0 0 1-2 2z" />
                  </svg>
                }
                label="Theme"
                hint="Brand tokens & palette"
              />
              <MoreRow
                disabled={!onAssets}
                onClick={() => handlePick(onAssets)}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                }
                label="Asset library"
                hint="Images & uploads"
                shortcut="⌘L"
              />
              <div
                aria-hidden
                style={{ height: 1, background: CHROME.line, margin: "4px 2px" }}
              />
              <MoreRow
                disabled={!onShare}
                onClick={() => setShareOpen(true)}
                icon={
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="18" cy="5" r="3" />
                    <circle cx="6" cy="12" r="3" />
                    <circle cx="18" cy="19" r="3" />
                    <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
                    <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
                  </svg>
                }
                label="Share preview link…"
                hint="Generate a private URL"
                showCaret
              />
            </>
          ) : (
            <div style={{ padding: 8 }}>
              <button
                type="button"
                onClick={() => setShareOpen(false)}
                className="cursor-pointer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: CHROME.muted,
                  background: "transparent",
                  border: "none",
                  marginBottom: 8,
                  padding: 0,
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Back
              </button>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: CHROME.ink,
                }}
              >
                Share a preview link
              </div>
              <div
                style={{
                  fontSize: 11.5,
                  color: CHROME.muted,
                  marginTop: 2,
                  lineHeight: 1.45,
                }}
              >
                Anyone with the link can view this draft until it expires.
              </div>
              <input
                type="text"
                value={shareLabel}
                onChange={(e) => setShareLabel(e.target.value)}
                placeholder="Q3 review draft"
                maxLength={80}
                spellCheck={false}
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "8px 10px",
                  fontSize: 13,
                  color: CHROME.ink,
                  background: CHROME.paper,
                  border: `1px solid ${CHROME.line}`,
                  borderRadius: 6,
                  outline: 0,
                  boxSizing: "border-box",
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleGenerateShare();
                  }
                }}
              />
              <div
                role="radiogroup"
                aria-label="Link expiration"
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr 1fr",
                  gap: 4,
                  marginTop: 8,
                }}
              >
                {SHARE_TTL_CHOICES.map((c) => {
                  const active = c.id === shareTtl;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setShareTtl(c.id)}
                      className="cursor-pointer"
                      style={{
                        padding: "7px 0",
                        fontSize: 12,
                        fontWeight: 500,
                        // Sprint 3.2 — radio-active uses the slate accent
                        // family rather than brand-black ink, keeping the
                        // active state distinguishable on black tenants.
                        background: active ? CHROME.accent : CHROME.paper,
                        color: active ? "#fff" : CHROME.text,
                        border: `1px solid ${active ? CHROME.accent : CHROME.line}`,
                        borderRadius: 6,
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                onClick={() => void handleGenerateShare()}
                disabled={shareBusy}
                className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  width: "100%",
                  marginTop: 10,
                  padding: "9px 12px",
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: "#fff",
                  // Sprint 3.2 — secondary primary uses slate accent.
                  background: CHROME.accent,
                  border: `1px solid ${CHROME.accent}`,
                  borderRadius: 6,
                  letterSpacing: "-0.005em",
                }}
              >
                {shareBusy ? "Generating…" : "Generate & copy link"}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MoreRow({
  disabled,
  onClick,
  icon,
  label,
  hint,
  shortcut,
  showCaret,
}: {
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  hint?: string;
  shortcut?: string;
  showCaret?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-[6px] px-[10px] py-[8px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{ color: CHROME.text, background: "transparent", border: "none" }}
      onMouseEnter={(e) => {
        if (!disabled) {
          (e.currentTarget as HTMLElement).style.background = CHROME.paper2;
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.background = "transparent";
      }}
    >
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-[5px]"
        style={{
          width: 26,
          height: 26,
          background: CHROME.paper2,
          color: CHROME.ink,
        }}
        aria-hidden
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block font-semibold tracking-[-0.005em]" style={{ color: CHROME.ink, fontSize: 13 }}>
          {label}
        </span>
        {hint ? (
          <span className="block" style={{ fontSize: 11, color: CHROME.muted, marginTop: 1 }}>
            {hint}
          </span>
        ) : null}
      </span>
      {shortcut ? (
        <span
          className="shrink-0 rounded-[3px] border px-[5px] py-[2px] font-mono"
          style={{
            fontSize: 10.5,
            color: CHROME.muted2,
            background: CHROME.paper2,
            borderColor: CHROME.line,
          }}
        >
          {shortcut}
        </span>
      ) : null}
      {showCaret ? (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={CHROME.muted2} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polyline points="9 18 15 12 9 6" />
        </svg>
      ) : null}
    </button>
  );
}

function ExitButton() {
  const { pending } = useFormStatus();
  return (
    <TbTextBtn type="submit" disabled={pending}>
      {pending ? "Exiting…" : "Exit"}
    </TbTextBtn>
  );
}

/**
 * Wraps the exit-edit form so we can intercept submit and confirm with
 * the operator when there are un-persisted inspector edits or a save
 * is mid-flight. `preventDefault` short-circuits the React 19 server-
 * action pipeline the same way it cancels native submits.
 */
function ExitForm({ dirty, saving }: { dirty: boolean; saving: boolean }) {
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (!dirty && !saving) return;
    const ok = window.confirm(
      "Exit edit mode with unsaved changes?\n\n" +
        "Your inspector field edits aren't saved yet — exiting now will discard them. " +
        "Composition moves are already auto-saved as a draft.",
    );
    if (!ok) e.preventDefault();
  };
  return (
    <form action={exitEditModeAction} onSubmit={handleSubmit}>
      <ExitButton />
    </form>
  );
}

// ── Main TopBar ───────────────────────────────────────────────────────────────

export interface TopBarProps {
  device: EditDevice;
  setDevice: (d: EditDevice) => void;
  /**
   * Preview toggle — true = canvas chrome suppressed, page is interactive.
   * Different from the URL-based ?preview=1 visitor view; this toggle
   * keeps the operator in EditShell and only hides editing affordances
   * (selection rings, hover pills, drag toolbars, link interceptor).
   */
  previewing: boolean;
  setPreviewing: (next: boolean) => void;
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPublish: () => void;
  /** Open the Page Settings drawer (cog icon in the right cluster). */
  onPageSettings?: () => void;
  /** Open the Revisions drawer (clock-arrow icon in the right cluster). */
  onRevisions?: () => void;
  /** Open the Theme drawer (palette icon in the right cluster). */
  onTheme?: () => void;
  /** Open the Assets drawer (folder icon in the right cluster). */
  onAssets?: () => void;
  /** Open the Schedule drawer (Phase 12 — Publish-split-button menu option). */
  onSchedule?: () => void;
  /** Open the Comments drawer (Phase 11 — speech-bubble icon in the right cluster). */
  onComments?: () => void;
  /** Live count of unresolved threads, surfaced as a badge on the icon. */
  commentsBadge?: number;
  /**
   * Save an explicit draft checkpoint. Resolves with the server timestamp
   * the surrounding chrome surfaces in its transient confirmation toast.
   * The button is disabled while a save is in flight.
   */
  onSaveDraft?: () => void | Promise<unknown>;
  /**
   * Mint a share link. Receives the operator-supplied label + TTL choice
   * from the popover form and returns the full URL to copy. The topbar
   * surfaces a transient confirmation when the promise resolves; failures
   * fall through to the surrounding mutation-error toast.
   */
  onShare?: (opts: {
    label?: string;
    ttlSeconds?: number;
  }) => Promise<string | null>;
  pageTitle?: string;
  /** The DB id of the page currently open in the editor. Used by PagePicker
   *  to highlight the active row in the full page list. */
  pageId?: string | null;
  /** The locale the editor is currently bound to. Drives the locale-switcher
   *  pill's active state. Optional — single-locale tenants render no pill. */
  activeLocale?: string;
  /** Locales the active tenant publishes. Empty/single-entry → no switcher. */
  availableLocales?: ReadonlyArray<string>;
}

/**
 * TTL choices the popover surfaces. Values match the JWT module's
 * clamped range (`SHARE_JWT_MIN_TTL_SECONDS` 1h → `SHARE_JWT_MAX_TTL_SECONDS` 30d).
 * Default highlights 7d which is also the server-action default.
 */
const SHARE_TTL_CHOICES = [
  { id: "1h", label: "1 hour", seconds: 60 * 60 },
  { id: "24h", label: "24 hours", seconds: 24 * 60 * 60 },
  { id: "7d", label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { id: "30d", label: "30 days", seconds: 30 * 24 * 60 * 60 },
] as const;
const SHARE_TTL_DEFAULT = "7d" as const;

export function TopBar({
  device,
  setDevice,
  previewing,
  setPreviewing,
  dirty,
  saving,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPublish,
  onPageSettings,
  onRevisions,
  onTheme,
  onAssets,
  onSchedule,
  onComments,
  commentsBadge,
  onSaveDraft,
  onShare,
  pageTitle,
  pageId,
  activeLocale,
  availableLocales = [],
}: TopBarProps) {
  const router = useRouter();

  function handleMenuSelect(opt: PublishMenuOption) {
    if (opt === "schedule") {
      if (onSchedule) onSchedule();
      else console.info("[topbar] schedule publish: no handler wired");
    } else if (opt === "save-draft") {
      // Same affordance as the Save draft text button — write a draft
      // revision row through the existing autosave path. Phase 4 layers
      // the named-draft prompt on top of this.
      if (onSaveDraft) void onSaveDraft();
    } else if (opt === "discard") {
      // Phase 4 — discard draft (revert to live snapshot)
      console.info("[topbar] discard draft: not yet implemented");
    }
  }

  function handlePreview() {
    // Phase 9 v2 — flip `?preview=1` ON in the same tab. EditChrome's
    // `useSearchParams` subscription picks the change up and swaps from
    // EditShell to PreviewPill without unmounting the storefront DOM,
    // so scroll position + any in-flight section reads stay intact. The
    // edit cookie is unaffected — the operator goes back to the shell
    // by clicking "Back to edit" inside the pill.
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("preview", "1");
    router.replace(`${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <div
      data-edit-topbar
      className="fixed inset-x-0 top-0 z-[90] flex items-center gap-[8px] px-[12px]"
      style={{
        height: TOPBAR_H,
        background: "rgba(255,255,255,0.88)",
        backdropFilter: "blur(20px) saturate(160%)",
        WebkitBackdropFilter: "blur(20px) saturate(160%)",
        borderBottom: `1px solid ${CHROME.line}`,
      }}
    >
      {/* ── Left cluster ── */}
      <BrandMark />
      <TbDivider />
      <PagePicker title={pageTitle ?? "Homepage"} pageId={pageId} dirty={dirty} />
      {activeLocale && availableLocales.length > 1 ? (
        <LocaleSwitcher
          activeLocale={activeLocale}
          availableLocales={availableLocales}
          dirty={dirty}
        />
      ) : null}
      <SaveStatus dirty={dirty} saving={saving} />
      <TbDivider />

      {/* ── Undo / Redo ── */}
      <TbIconBtn
        title="Undo (⌘Z)"
        onClick={onUndo}
        disabled={!canUndo}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
        </svg>
      </TbIconBtn>
      <TbIconBtn
        title="Redo (⇧⌘Z)"
        onClick={onRedo}
        disabled={!canRedo}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 7v6h-6" />
          <path d="M3 17a9 9 0 0 1 15-6.7l3 2.7" />
        </svg>
      </TbIconBtn>

      {/* ── Spacer ── */}
      <span className="flex-1" />

      {/* ── Viewport switcher ── */}
      <ViewportSwitcher device={device} setDevice={setDevice} />

      {/* ── Preview toggle ──
       * Suppresses canvas editing chrome (selection rings, hover pills,
       * drag toolbars, link interceptor) so the operator can interact
       * with the live page exactly as a visitor would. The drawer
       * stays accessible — flip back to test → tweak → test in seconds.
       */}
      <PreviewToggle previewing={previewing} setPreviewing={setPreviewing} />

      {/* ── Spacer ── */}
      <span className="flex-1" />

      {/* ── Right cluster — surfaced primaries only ──
       *
       * Compression sprint (2026-04-28): the topbar used to render eight
       * icon buttons + a Save draft text button on the right. Now it
       * renders three. Comments stays surfaced because it carries an
       * unread badge that needs to be glanceable; Preview stays because
       * it's the highest-frequency secondary action; everything else
       * (Page settings · Revisions · Theme · Assets · Share) collapses
       * into the More menu so the eye lands on Publish without sweeping
       * past a row of equal-weight icons. Save draft is handled by
       * autosave + the Publish split-button's "Save as named draft…"
       * checkpoint entry — no dedicated button needed.
       */}
      <TbIconBtn
        title="Comments"
        onClick={onComments}
        badge={commentsBadge}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </TbIconBtn>
      <TbIconBtn title="Preview as visitor (⌘P)" onClick={handlePreview}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </TbIconBtn>
      <MoreMenu
        onPageSettings={onPageSettings}
        onRevisions={onRevisions}
        onTheme={onTheme}
        onAssets={onAssets}
        onShare={onShare}
      />

      <TbDivider />

      {/* ── Publish split (primary CTA) ── */}
      <PublishSplitButton
        onPublish={onPublish}
        onMenuSelect={handleMenuSelect}
        disabled={saving}
      />

      <TbDivider />

      {/* ── Exit ── */}
      <ExitForm dirty={dirty} saving={saving} />
    </div>
  );
}
