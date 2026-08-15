"use client";
import { improntaLog } from "@/lib/server/structured-log";
import {
  useBuilderBreakpoints,
  notifyBuilderBreakpointsChanged,
} from "./use-builder-breakpoints";
import {
  breakpointLabelForDevice,
  naturalWidthForDevice,
  DEFAULT_BUILDER_BREAKPOINTS,
  saveCustomBreakpoints,
  type BuilderBreakpoint,
} from "./breakpoint-registry";
import { useAdvancedMode } from "./advanced-mode";
import { visibleViewportTiers } from "./advanced-mode-visibility";

/**
 * EditTopBar — mission control bar for the canvas editor.
 *
 * Implements builder-experience.html surface §1 (Top bar — mission control).
 * Last reconciled: 2026-04-25.
 *
 * Layout (left to right):
 *   Brand mark → divider → page picker → save status + live publish hint → divider →
 *   undo/redo → [spacer] → viewport switcher · breakpoints · preview toggle → [spacer] →
 *   comments · share · preview → divider →
 *   Save draft · Publish split-button → divider → Exit
 *
 * Visual language: 54px glass bar, warm-white tint, hairline border —
 * tokens, heights, radii, shadows all match the mockup §1 spec.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { exitEditModeAction } from "@/lib/site-admin/edit-mode/server";
import { copyPublishedHomepageAction } from "@/lib/site-admin/edit-mode/composition-actions";
import { safeAction } from "@/lib/site-admin/edit-mode/safe-action";
import { localeMetadata } from "@/i18n/config";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin/locales";
import {
  listPagesForPickerAction,
  duplicatePageAction,
  createDraftPageAction,
} from "@/lib/server-actions/admin-site-pages";
import {
  type PagePickerItem,
  type PagePickerAvailability,
} from "@/lib/server-actions/admin-site-pages-picker";
import {
  useMaybeEditContext,
  type EditDevice,
  type PreviewFrameOverride,
} from "./edit-context";
import { useLastDraftSavedAt, useSaving } from "./save-cycle-bridge";
import { flushThenNavigate } from "./page-switch-flush";
import { resolveAddPageDenialMessage } from "./all-pages-panel-deny-reason";
import { useEditorLocale } from "./use-editor-locale";
import { resolveWorkspaceAdminBaseForLocation } from "./workspace-admin-base";
import {
  CHROME,
  CHROME_RADII,
  CHROME_SHADOWS,
  EDIT_TOPBAR_H,
  PortaledOverlay,
  SaveChip,
} from "./kit";
import { usePagePresence } from "./presence-provider";
import { RailPresenceStack } from "./chrome-icon-rail";
import { isBuilderPresenceEnabled } from "@/lib/site-admin/edit-mode/presence-flag";
import { useEditContext } from "./edit-context";
import {
  publishActiveContentLocale,
  useActiveContentLocale,
  buildContentFallbackChain,
} from "./active-content-locale-bridge";

const TOPBAR_H = EDIT_TOPBAR_H;
/** Shared control sizing — mockup breathing-room pass. */
const TB_CONTROL_H = 40;
const TB_ICON_PX = 18;
const TB_FONT_PX = 14;
const TB_RADIUS = 10;

// ── helpers ──────────────────────────────────────────────────────────────────

function TbDivider() {
  return (
    <span
      aria-hidden
      className="shrink-0"
      style={{
        width: 1,
        height: 30,
        background: CHROME.lineStrong,
        margin: "0 10px",
        opacity: 0.5,
      }}
    />
  );
}

interface TbIconBtnProps {
  title: string;
  ariaLabel?: string;
  id?: string;
  ariaExpanded?: boolean;
  ariaHaspopup?: boolean | "menu" | "dialog";
  ariaControls?: string;
  onClick?: () => void;
  disabled?: boolean;
  badge?: number;
  /**
   * #14 — optional short text label shown below the icon (10px, muted).
   * Pass a 1–2 word label for right-cluster action buttons where the glyph
   * alone is ambiguous. Omit for undo/redo and other utility buttons where
   * the tooltip is sufficient and horizontal space is tight.
   */
  label?: string;
  children: React.ReactNode;
}

function TbIconBtn({
  title,
  ariaLabel,
  id,
  ariaExpanded,
  ariaHaspopup,
  ariaControls,
  onClick,
  disabled,
  badge,
  label,
  children,
}: TbIconBtnProps) {
  return (
    <button
      type="button"
      id={id}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel ?? title}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHaspopup}
      aria-controls={ariaControls}
      className="relative inline-flex shrink-0 cursor-pointer items-center rounded-[10px] border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/45 disabled:cursor-not-allowed"
      style={{
        width: label ? 48 : 40,
        height: 40,
        flexDirection: label ? "column" : "row",
        justifyContent: "center",
        gap: label ? 1 : undefined,
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
      {label ? (
        <span
          aria-hidden
          style={{
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.02em",
            lineHeight: 1,
            color: "inherit",
            pointerEvents: "none",
          }}
        >
          {label}
        </span>
      ) : null}
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
  pagesPickerOpenNonce,
}: {
  title: string;
  pageId?: string | null;
  dirty?: boolean;
  /** Bumped by EditShell when URL contains `?panel=pages` (legacy admin redirect). */
  pagesPickerOpenNonce?: number;
}) {
  const editCtx = useMaybeEditContext();
  const websiteSlug = editCtx?.workspaceMembershipSlug ?? "";
  // Same host trap the quick bar hit: on a `/w/<slug>` storefront (the free
  // tier's default, served on the marketing host) a same-origin
  // `/{slug}/admin/website` 404s, so the base has to be resolved from the live
  // location and may be absolute. See `workspace-admin-base.ts`.
  const workspaceWebsiteHref = useMemo(() => {
    if (websiteSlug === "") return "/admin/site";
    if (typeof window === "undefined") return `/${websiteSlug}/admin/website`;
    return `${resolveWorkspaceAdminBaseForLocation(websiteSlug, window.location)}/website`;
  }, [websiteSlug]);

  const [open, setOpen] = useState(false);
  const [pages, setPages] = useState<PagePickerItem[] | null>(null);
  const [availability, setAvailability] = useState<PagePickerAvailability | null>(
    null,
  );
  const [loadingPages, setLoadingPages] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [creatingPage, setCreatingPage] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  // FIX #7 — the row Duplicate button is gated by the SAME plan rule as
  // "+ Add page" (a duplicate is an additional page). It used to grey out with
  // a static `Duplicate "<title>"` tooltip, so on a capped plan the operator got
  // a dead control and no reason. Reuse the one canonical reason resolver the
  // upsell row above and all-pages-panel already use.
  const duplicateDenialMessage = resolveAddPageDenialMessage(availability);
  const router = useRouter();
  const pagePickerMenuId = useId();
  const pagePickerTriggerId = useId();
  // Fixed-position anchor + portal to <body> so the menu escapes the topbar's
  // overflow-y-hidden scroll container. position:fixed ALONE is not enough: the
  // topbar's backdrop-filter makes it the containing block for fixed descendants,
  // so an in-tree fixed menu still gets clipped to the bar. The portal is load-
  // bearing — same fix as the publish-split menu.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  // Double-click-to-rename the page/template title inline.
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState(title);
  const renameDoneRef = useRef(false);

  async function commitRename() {
    if (renameDoneRef.current) return; // dedupe Enter + blur
    renameDoneRef.current = true;
    const next = nameDraft.trim();
    setRenaming(false);
    if (
      editCtx?.savePageMetadata &&
      editCtx.pageMetadata &&
      next &&
      next !== title
    ) {
      await editCtx.savePageMetadata({ ...editCtx.pageMetadata, title: next });
    }
  }
  function cancelRename() {
    renameDoneRef.current = true;
    setRenaming(false);
  }

  useEffect(() => {
    if ((pagesPickerOpenNonce ?? 0) > 0) setOpen(true);
  }, [pagesPickerOpenNonce]);

  // Reset page list when popover closes so it always re-fetches on next open
  // (picks up pages created/renamed in another tab or from Manage pages).
  useEffect(() => {
    if (!open) {
      setPages(null);
      setAvailability(null);
      setFetchErr(null);
    }
  }, [open]);

  // Lazy-fetch when opened.
  useEffect(() => {
    if (!open || pages !== null || loadingPages) return;
    setLoadingPages(true);
    listPagesForPickerAction()
      .then((result) => {
        if (result.ok) {
          setPages(result.pages);
          setAvailability(result.availability);
        }
        else {
          setFetchErr(result.error);
          setPages([]);
          setAvailability(null);
        }
      })
      .catch(() => {
        setFetchErr("Couldn't load pages. Try again.");
        setPages([]);
        setAvailability(null);
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

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  // CANVAS-2 — silent autosave flush on page switch (no blocking confirm()).
  // The shared flushThenNavigate awaits the EditProvider flush when dirty so the
  // debounced draft commits before navigating; firing-and-forgetting would let an
  // in-flight save race the route change and trip VERSION_CONFLICT. The
  // `navigating` guard disables the row while the flush settles.
  async function navToPage(slug: string) {
    if (navigating) return;
    setNavigating(true);
    try {
      await flushThenNavigate({
        dirty: dirty ?? false,
        flush: editCtx?.flushBuilderTreeSave,
        navigate: () => {
          setOpen(false);
          router.push(slug === "" ? "/?edit=1" : `/${slug}?edit=1`);
        },
      });
    } finally {
      setNavigating(false);
    }
  }

  async function handleCreatePage() {
    if (availability && !availability.canCreatePages) {
      setFetchErr(
        availability.createPageHint ??
          "Upgrade your plan to create additional pages.",
      );
      return;
    }
    setCreatingPage(true);
    setFetchErr(null);
    try {
      const result = await createDraftPageAction();
      if (result.ok) {
        // Flush the current page's draft before navigating to the new page so
        // un-persisted edits aren't lost on the route change (see navToPage).
        await flushThenNavigate({
          dirty: dirty ?? false,
          flush: editCtx?.flushBuilderTreeSave,
          navigate: () => {
            setOpen(false);
            router.push(result.slug ? `/${result.slug}?edit=1` : "/?edit=1");
          },
        });
      } else {
        setFetchErr(result.error);
      }
    } finally {
      setCreatingPage(false);
    }
  }

  async function handleDuplicate(sourceId: string) {
    if (availability && !availability.canCreatePages) {
      setFetchErr(
        availability.createPageHint ??
          "Upgrade your plan to create additional pages.",
      );
      return;
    }
    setDuplicatingId(sourceId);
    try {
      const result = await duplicatePageAction(sourceId);
      if (result.ok) {
        setOpen(false);
        router.push(
          result.slug === ""
            ? "/?edit=1&panel=pageSettings"
            : `/${result.slug}?edit=1&panel=pageSettings`,
        );
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
      {/* ── Trigger (single-click = switch page · double-click = rename) ── */}
      {renaming ? (
        <input
          autoFocus
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commitRename();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancelRename();
            }
          }}
          onBlur={() => void commitRename()}
          aria-label="Rename"
          className="rounded-[10px] border"
          style={{
            padding: "7px 11px",
            fontSize: TB_FONT_PX,
            fontWeight: 500,
            color: CHROME.ink,
            background: CHROME.paper,
            borderColor: CHROME.accent,
            outline: "none",
            minWidth: 140,
            maxWidth: 280,
          }}
        />
      ) : (
        <button
          type="button"
          ref={triggerRef}
          id={pagePickerTriggerId}
          title="Click to switch page · double-click to rename"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={pagePickerMenuId}
          onClick={() =>
            setOpen((o) => {
              const next = !o;
              if (next && triggerRef.current) {
                const rect = triggerRef.current.getBoundingClientRect();
                setMenuPos({ top: rect.bottom + 4, left: rect.left });
              }
              return next;
            })
          }
          onDoubleClick={() => {
            setOpen(false);
            setNameDraft(title);
            renameDoneRef.current = false;
            setRenaming(true);
          }}
          className="inline-flex shrink-0 cursor-pointer items-center gap-[8px] rounded-[10px] border border-transparent transition-colors"
          style={{
            padding: "8px 12px",
            fontSize: TB_FONT_PX,
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
          <span className="font-medium tracking-[-0.005em]" style={{ color: CHROME.ink, fontSize: TB_FONT_PX }}>
            {title || "Homepage"}
          </span>
          <span style={{ color: CHROME.muted2 }} aria-hidden>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>
      )}

      {open && menuPos ? (
        <PortaledOverlay>
        <div
          id={pagePickerMenuId}
          role="menu"
          data-page-picker
          aria-labelledby={pagePickerTriggerId}
          className="z-[120] min-w-[280px] rounded-[10px] p-[6px]"
          style={{
            // Fixed + portaled to <body> (see triggerRef note) so the topbar's
            // overflow-y-hidden + backdrop-filter containing block can't clip it.
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
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
          {availability && !availability.canCreatePages ? (
            <div
              role="menuitem"
              aria-disabled
              className="flex items-center gap-[8px] rounded-[6px] px-[10px] py-[7px]"
              style={{ color: CHROME.muted }}
            >
              <span
                className="inline-flex shrink-0 items-center justify-center rounded-[4px]"
                style={{
                  width: 18,
                  height: 18,
                  background: CHROME.paper2,
                  color: CHROME.muted2,
                }}
                aria-hidden
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
              <span
                className="flex-1 font-semibold tracking-[-0.005em]"
                style={{ fontSize: 12.5 }}
              >
                Add new page
              </span>
            </div>
          ) : (
            <Link
              href={workspaceWebsiteHref}
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
          )}
          {availability?.createPageHint ? (
            <div
              className="px-[10px] pb-[4px]"
              style={{ fontSize: 11, color: CHROME.muted2, lineHeight: 1.35 }}
            >
              {availability.createPageHint}
            </div>
          ) : null}

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
                      if (!isCurrent) void navToPage(page.slug);
                    }}
                    disabled={isCurrent || navigating}
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
                    disabled={navigating}
                    onClick={() => void navToPage(page.slug)}
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>

                  {/* Duplicate icon */}
                  <button
                    type="button"
                    title={
                      duplicateDenialMessage ?? `Duplicate "${page.title}"`
                    }
                    aria-label={
                      duplicateDenialMessage
                        ? `Duplicate "${page.title}" (unavailable: ${duplicateDenialMessage})`
                        : `Duplicate "${page.title}"`
                    }
                    disabled={isDuplicating || duplicateDenialMessage !== null}
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

          {/* ── Footer: create + manage pages ── */}
          <div aria-hidden style={{ height: 1, background: CHROME.line, margin: "6px 2px" }} />
          <button
            type="button"
            role="menuitem"
            disabled={creatingPage}
            onClick={() => void handleCreatePage()}
            className="flex w-full cursor-pointer items-center gap-[8px] rounded-[6px] border-none px-[10px] py-[7px] text-left transition-colors"
            style={{ color: CHROME.text, background: "transparent" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = CHROME.paper2;
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span
              className="inline-flex shrink-0 items-center justify-center rounded-[4px]"
              style={{ width: 18, height: 18, background: CHROME.paper2, color: CHROME.muted }}
              aria-hidden
            >
              +
            </span>
            <span className="flex-1 font-semibold tracking-[-0.005em]" style={{ fontSize: 12.5 }}>
              {creatingPage ? "Creating…" : "New page"}
            </span>
          </button>
          <Link
            href={workspaceWebsiteHref}
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
        </PortaledOverlay>
      ) : null}
    </div>
  );
}

// ── #18 — relative "Saved Xs ago" formatter ─────────────────────────────────

function formatSavedAgo(isoOrEpoch: string): string {
  const ms = Date.now() - new Date(isoOrEpoch).getTime();
  if (ms < 5_000) return "just now";
  if (ms < 60_000) return `${Math.floor(ms / 1_000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  return `${Math.floor(ms / 3_600_000)}h ago`;
}

/**
 * Perf spine — leaf Save-draft button. Subscribes to `saving` HERE so the
 * double-submit guard (an explicit manual save while one is in flight) keeps
 * working without the whole topbar re-rendering on every save flip. This gate
 * is KEPT deliberately: it is a pressed-state affordance on an action that
 * writes, not a stale-fragility gate.
 */
function SaveDraftButton({
  onSaveDraft,
}: {
  onSaveDraft: () => void | Promise<unknown>;
}) {
  const saving = useSaving();
  return (
    <TbOutlineBtn
      onClick={() => void onSaveDraft()}
      disabled={saving}
      title="Save draft (⌘S)"
    >
      <span
        className="inline-flex shrink-0 items-center justify-center rounded-full"
        style={{
          width: 18,
          height: 18,
          background: CHROME.green,
          color: CHROME.surface,
        }}
        aria-hidden
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      Save
    </TbOutlineBtn>
  );
}

/**
 * #18 — SaveStatus: surfaces the autosave state with a relative "Saved Xs ago"
 * timestamp (from `lastDraftSavedAt`) so operators always know when the last
 * checkpoint was written, and shows an amber "Unpublished changes" pill when
 * the draft was saved AFTER the last publish (or when the page has never been
 * published), signalling the live site doesn't yet reflect current work.
 */
function SaveStatus({
  dirty,
  liveSitePublishedAt,
}: {
  dirty: boolean;
  /** ISO timestamp when the page was last published, or null if never. */
  liveSitePublishedAt?: string | null;
}) {
  // Perf spine (save-cycle bridge) — `saving` / `lastDraftSavedAt` are read
  // HERE via the micro-store (not prop-drilled from the shell), so a save
  // cycle re-renders only this status chip, not the whole topbar/shell.
  const saving = useSaving();
  const lastDraftSavedAt = useLastDraftSavedAt();
  // W3-T2(a) — surface a persistent SAVE-FAILURE state in the topbar status,
  // not just the transient mutation toast. A draft that didn't persist
  // (SAVE_FAILED) or lost a CAS race (VERSION_CONFLICT) flips the status chip to
  // the rose "Couldn't save" state until the operator acts, so the failure is
  // never invisible once the toast is gone.
  const { mutationError } = useEditContext();
  const saveFailed =
    !saving &&
    (mutationError?.code === "SAVE_FAILED" ||
      mutationError?.code === "VERSION_CONFLICT");

  // Tick every 15 s so relative "Xs ago" stays reasonably fresh without
  // hammering re-renders. The display is informational, not realtime.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!lastDraftSavedAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 15_000);
    return () => clearInterval(id);
  }, [lastDraftSavedAt]);

  // "Unpublished changes" = draft was saved at or after the last publish,
  // OR the page has never been published. Detect by comparing ISO strings.
  const hasUnpublishedChanges = Boolean(
    lastDraftSavedAt &&
      (!liveSitePublishedAt ||
        new Date(lastDraftSavedAt).getTime() >=
          new Date(liveSitePublishedAt).getTime()),
  );

  const dot = "inline-block shrink-0 rounded-full";

  if (saving) {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
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
  if (saveFailed) {
    const label =
      mutationError?.code === "VERSION_CONFLICT"
        ? "Save conflict"
        : "Couldn't save";
    return (
      <span role="status" aria-live="polite" aria-atomic="true">
        <SaveChip
          status="error"
          label={label}
          title={
            mutationError?.code === "VERSION_CONFLICT"
              ? "This page changed in another tab or session. Choose Reload latest or Keep editing this copy in the banner."
              : "Your last draft didn't save. It will retry on your next edit; reload the editor if it persists."
          }
        />
      </span>
    );
  }
  if (dirty) {
    return (
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="inline-flex shrink-0 items-center gap-[6px] rounded-full border text-[11px] font-semibold"
        style={{
          padding: "4px 11px 4px 9px",
          background: CHROME.amberBg,
          color: CHROME.amber,
          borderColor: CHROME.amberLine,
        }}
        title="Edits are only in your draft until you publish. If the canvas or device preview looks one step behind, wait for autosave to finish or switch viewport to refresh the preview."
        aria-label="Unsaved draft. Changes are not fully saved yet, or the preview may still be catching up."
      >
        <span
          className={dot}
          style={{ width: 6, height: 6, background: CHROME.amber, boxShadow: "0 0 8px rgba(58,123,255,0.6)" }}
          aria-hidden
        />
        Unsaved draft
      </span>
    );
  }

  // Saved state — plain "Draft saved" text per canvas-first mockup.
  const savedAgoText = lastDraftSavedAt
    ? `Draft saved · ${formatSavedAgo(lastDraftSavedAt)}`
    : "Draft saved";

  return (
    <>
      <span
        role="status"
        aria-live="polite"
        aria-atomic="true"
        className="inline-flex shrink-0 items-center gap-[5px] text-[13px] font-medium"
        style={{ color: CHROME.muted }}
        title={
          lastDraftSavedAt
            ? `Draft last saved at ${new Date(lastDraftSavedAt).toLocaleString()}. Visitors see the last published version until you publish.`
            : "Draft is saved on our servers. Visitors still see the published site until you click Publish."
        }
        aria-label={savedAgoText}
      >
        <svg
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke={CHROME.green}
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        Draft saved
      </span>
      {/* #18 — "Unpublished changes" amber pill: visible whenever there are
          draft saves that haven't been published to the live site yet. This
          gives operators an at-a-glance signal that the live site differs
          from what they see in the canvas. Click Publish to close the gap. */}
      {hasUnpublishedChanges ? (
        <span
          role="note"
          aria-label="You have unpublished changes. The live site still shows the previous published version."
          className="inline-flex shrink-0 items-center gap-[5px] rounded-full border text-[10.5px] font-semibold"
          style={{
            padding: "3px 9px 3px 8px",
            background: CHROME.amberBg,
            color: CHROME.amber,
            borderColor: CHROME.amberLine,
          }}
          title="The live site visitors see does not yet reflect your saved draft. Click Publish to push these changes live."
        >
          <span
            className={dot}
            style={{ width: 5, height: 5, background: CHROME.amber }}
            aria-hidden
          />
          Unpublished changes
        </span>
      ) : null}
    </>
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
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8" y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
  {
    key: "wide",
    label: "Wide",
    icon: (
      <svg width="13" height="11" viewBox="0 0 26 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="1" y="3" width="24" height="13" rx="2" />
        <line x1="9" y1="20" x2="17" y2="20" />
      </svg>
    ),
  },
  {
    key: "tablet",
    label: "Tablet",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="4" y="2" width="16" height="20" rx="2" />
      </svg>
    ),
  },
  {
    key: "mobile",
    label: "Mobile",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="7" y="2" width="10" height="20" rx="2" />
      </svg>
    ),
  },
  {
    key: "compact",
    label: "Compact",
    icon: (
      <svg width="9" height="11" viewBox="0 0 18 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="5" y="2" width="8" height="20" rx="2" />
      </svg>
    ),
  },
];

function viewportTierActive(device: EditDevice, key: EditDevice): boolean {
  if (device === key) return true;
  return key === "desktop" && (device === "wide" || device === "compact");
}

function viewportPreviewTitle(device: EditDevice, label: string): string {
  if (device === "desktop") {
    return `${label}: full-width editing canvas`;
  }
  return `${label}: device-width iframe preview, reloads when the draft saves so breakpoints stay accurate`;
}

/**
 * WS5 — in-session content-locale toggle. REPLACES the navigate+reload
 * `LocaleSwitcher` for the page-builder per-element translation feature.
 *
 * Flipping a locale here does NOT navigate or reload: it publishes the active
 * content locale (+ its fallback chain) to the `active-content-locale-bridge`,
 * which the canvas reads to re-render every node through `resolveNodeProp` (a
 * fallback node renders at 40% opacity) and the Content panel's per-field tabs
 * read to default to the active locale. The base/default locale renders the
 * page exactly as published; secondary locales surface the translation gaps.
 *
 * Hidden entirely for single-language tenants (< 2 supported locales).
 */
function ContentLocaleToggle({
  defaultLocale,
  availableLocales,
}: {
  defaultLocale: string;
  availableLocales: ReadonlyArray<string>;
}) {
  const { locale: activeContentLocale } = useActiveContentLocale();
  const buttonsRef = useRef<Array<HTMLButtonElement | null>>([]);

  // Default first, then the rest in tenant order.
  const orderedLocales = useMemo(
    () => [
      defaultLocale,
      ...availableLocales.filter((l) => l !== defaultLocale),
    ],
    [defaultLocale, availableLocales],
  );

  const selectLocale = useCallback(
    (code: string) => {
      if (code === activeContentLocale) return;
      publishActiveContentLocale({
        locale: code,
        defaultLocale,
        chain: buildContentFallbackChain(code, defaultLocale, orderedLocales),
      });
    },
    [activeContentLocale, defaultLocale, orderedLocales],
  );

  const handleKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (orderedLocales.length < 2) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const idx = orderedLocales.indexOf(activeContentLocale);
      const dir = e.key === "ArrowLeft" ? -1 : 1;
      const next =
        orderedLocales[
          (idx + dir + orderedLocales.length) % orderedLocales.length
        ];
      if (next) selectLocale(next);
    },
    [activeContentLocale, orderedLocales, selectLocale],
  );

  if (orderedLocales.length < 2) return null;

  return (
    <div
      className="inline-flex shrink-0 items-center rounded-full p-[4px]"
      style={{
        background: "rgba(0,0,0,0.05)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)",
      }}
      role="radiogroup"
      aria-label="Content language (in-session preview + per-block translation)"
      onKeyDown={handleKey}
    >
      {orderedLocales.map((code, i) => {
        const meta = localeMetadata[code];
        const label = meta?.label ?? code.toUpperCase();
        const active = code === activeContentLocale;
        const isDefault = code === defaultLocale;
        return (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            ref={(el) => {
              buttonsRef.current[i] = el;
            }}
            title={
              isDefault
                ? `Show the page in ${label} (default). ←/→ to cycle`
                : `Translate / preview the page in ${label} (untranslated blocks dim). ←/→ to cycle`
            }
            onClick={() => selectLocale(code)}
            className="inline-flex items-center gap-[5px] rounded-full border-none px-[14px] py-[7px] text-[13px] font-semibold uppercase tracking-[0.04em] transition-all"
            style={{
              background: active ? CHROME.surface : "transparent",
              color: active ? CHROME.ink : CHROME.muted,
              boxShadow: active
                ? "0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)"
                : "none",
              cursor: active ? "default" : "pointer",
            }}
          >
            {code}
          </button>
        );
      })}
    </div>
  );
}

// Job #17 — custom-width bounds (mirrors edit-shell's PREVIEW_WIDTH_MIN/MAX so
// the input clamps before the override even reaches the frame resolver).
const PREVIEW_WIDTH_MIN = 280;
const PREVIEW_WIDTH_MAX = 1920;
// Natural portrait widths per tier — seed the custom-width input when blank so
// the operator nudges from the real frame width, not an empty field.
// Defaults mirror edit-shell DEVICE_WIDTHS; overridden at runtime via the
// breakpoint registry (Builder 2026 M4).
const VIEWPORT_NATURAL_WIDTH_FALLBACK: Record<EditDevice, number> = {
  desktop: 1280,
  wide: 1200,
  tablet: 834,
  mobile: 390,
  compact: 414,
};

function ViewportSwitcher({
  device,
  setDevice,
  previewFrame,
  setPreviewFrameWidth,
  togglePreviewRotated,
  mobileEditMode,
  setMobileEditMode,
}: {
  device: EditDevice;
  setDevice: (d: EditDevice) => void;
  /** Job #17 — current frame override; null when no EditProvider is mounted. */
  previewFrame: PreviewFrameOverride | null;
  setPreviewFrameWidth?: (widthPx: number | null) => void;
  togglePreviewRotated?: () => void;
  /**
   * Wave 6C (job #35) — when present, the Mobile tier becomes a real EDITING
   * mode (not just a preview frame): picking Mobile enters `mobileEditMode`
   * (which pins the canvas to mobile + opens the mobile HUD), and picking
   * Desktop/Tablet exits it first. Optional → no EditProvider falls back to the
   * plain `setDevice` behaviour.
   */
  mobileEditMode?: boolean;
  setMobileEditMode?: (next: boolean) => void;
}) {
  const mobileEditAvailable = typeof setMobileEditMode === "function";
  const breakpoints = useBuilderBreakpoints();
  const { advanced } = useAdvancedMode();
  // Picking a tier: Mobile enters the editing mode; the others exit it. When no
  // mode plumbing is present, this is exactly the old `setDevice`.
  const selectTier = (key: EditDevice) => {
    if (mobileEditAvailable && setMobileEditMode) {
      if (key === "mobile") {
        setMobileEditMode(true);
        return;
      }
      if (mobileEditMode) setMobileEditMode(false);
    }
    setDevice(key);
  };
  // The frame tools (#17) — custom width + landscape — are a power-user surface:
  // available only on a non-desktop frame, only with the context setters, AND
  // only when Advanced is ON (W2-C4). The core per-breakpoint editing stays.
  const frameToolsAvailable =
    advanced &&
    device !== "desktop" &&
    previewFrame != null &&
    typeof setPreviewFrameWidth === "function" &&
    typeof togglePreviewRotated === "function";

  // W2-C4 — default (Advanced OFF) shows Desktop · Tablet · Mobile; Advanced ON
  // adds Wide + Compact. Order follows the canonical VIEWPORT_OPTS list.
  const visibleTierKeys = new Set(visibleViewportTiers(advanced));
  const visibleOpts = VIEWPORT_OPTS.filter((opt) => visibleTierKeys.has(opt.key));

  return (
    <div className="inline-flex shrink-0 items-center gap-2">
      <div
        role="group"
        aria-label="Canvas preview width"
        className="inline-flex shrink-0 items-center gap-[8px]"
      >
        {visibleOpts.map((opt) => {
          const active = viewportTierActive(device, opt.key);
          const label = breakpointLabelForDevice(opt.key, breakpoints);
          const inMobileEditMode =
            opt.key === "mobile" && active && Boolean(mobileEditMode);
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => selectTier(opt.key)}
              title={
                opt.key === "mobile" && mobileEditAvailable
                  ? "Mobile editing: edit the mobile layout, scope style edits to mobile, hide/reorder blocks per-phone, run mobile health checks"
                  : viewportPreviewTitle(opt.key, label)
              }
              aria-label={
                opt.key === "mobile" && mobileEditAvailable
                  ? "Mobile editing mode"
                  : label
              }
              aria-pressed={active}
              className="relative inline-flex items-center justify-center rounded-[10px] border-none transition-all"
              style={{
                width: 44,
                height: 44,
                background: active
                  ? "rgba(124, 58, 237, 0.08)"
                  : "transparent",
                color: active ? CHROME.accent : CHROME.ink,
                boxShadow: active
                  ? `inset 0 0 0 1px ${CHROME.accent}`
                  : "none",
                cursor: "pointer",
              }}
            >
              {opt.icon}
              {inMobileEditMode ? (
                <span
                  aria-hidden
                  className="absolute"
                  style={{
                    width: 5,
                    height: 5,
                    marginTop: 14,
                    marginLeft: 14,
                    borderRadius: 999,
                    background: CHROME.accent,
                  }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      {frameToolsAvailable && previewFrame ? (
        <ViewportFrameTools
          device={device}
          previewFrame={previewFrame}
          // Non-null asserted via frameToolsAvailable.
          setPreviewFrameWidth={setPreviewFrameWidth!}
          togglePreviewRotated={togglePreviewRotated!}
        />
      ) : null}
    </div>
  );
}

/**
 * Job #17 — responsive-preview frame tools shown beside the device switcher
 * when a non-desktop frame is active: a custom-width input, a one-click
 * Landscape (rotate) toggle, and a Reset back to the device's natural portrait
 * width. Reuses the existing `previewFrame` context override — landscape just
 * sets `rotated`, custom width sets `widthPx` (clamped), reset clears both.
 */
function ViewportFrameTools({
  device,
  previewFrame,
  setPreviewFrameWidth,
  togglePreviewRotated,
}: {
  device: EditDevice;
  previewFrame: PreviewFrameOverride;
  setPreviewFrameWidth: (widthPx: number | null) => void;
  togglePreviewRotated: () => void;
}) {
  const breakpoints = useBuilderBreakpoints();
  const isCustom = previewFrame.widthPx != null;
  const isRotated = previewFrame.rotated;
  // Draft text so an in-progress entry ("8") isn't clamped mid-keystroke.
  const [draft, setDraft] = useState<string | null>(null);
  const naturalWidth =
    naturalWidthForDevice(device, breakpoints) ||
    VIEWPORT_NATURAL_WIDTH_FALLBACK[device];
  const displayWidth = previewFrame.widthPx ?? naturalWidth;
  const inputValue = draft ?? String(displayWidth);

  const commitWidth = useCallback(
    (raw: string) => {
      setDraft(null);
      const trimmed = raw.trim();
      if (trimmed === "") {
        setPreviewFrameWidth(null);
        return;
      }
      const parsed = Number.parseInt(trimmed, 10);
      if (!Number.isFinite(parsed)) {
        setPreviewFrameWidth(null);
        return;
      }
      const clamped = Math.min(
        PREVIEW_WIDTH_MAX,
        Math.max(PREVIEW_WIDTH_MIN, parsed),
      );
      setPreviewFrameWidth(clamped);
    },
    [setPreviewFrameWidth],
  );

  return (
    <div
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-1.5 py-[3px]"
      style={{
        background: "rgba(0,0,0,0.05)",
        boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)",
      }}
    >
      {/* Custom-width input */}
      <label
        className="inline-flex items-center gap-1"
        title="Custom preview width (px). The frame resizes and storefront breakpoints re-fire at this width."
        style={{ color: CHROME.muted, fontSize: 11, fontWeight: 600 }}
      >
        <span aria-hidden>W</span>
        <input
          type="number"
          inputMode="numeric"
          min={PREVIEW_WIDTH_MIN}
          max={PREVIEW_WIDTH_MAX}
          step={1}
          aria-label="Custom preview width in pixels"
          value={inputValue}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={(e) => commitWidth(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitWidth((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).blur();
            } else if (e.key === "Escape") {
              setDraft(null);
              (e.target as HTMLInputElement).blur();
            }
          }}
          style={{
            width: 52,
            height: 24,
            textAlign: "right",
            borderRadius: 6,
            border: `1px solid ${isCustom ? CHROME.blueLine : "rgba(0,0,0,0.10)"}`,
            background: CHROME.surface,
            color: isCustom ? CHROME.blue : CHROME.ink,
            fontSize: 11.5,
            fontWeight: 600,
            padding: "0 5px",
            outline: "none",
            MozAppearance: "textfield",
          }}
        />
        <span aria-hidden style={{ color: CHROME.muted2 }}>
          px
        </span>
      </label>
      {/* Landscape / rotate toggle */}
      <button
        type="button"
        onClick={togglePreviewRotated}
        disabled={isCustom}
        aria-pressed={isRotated}
        title={
          isCustom
            ? "Clear the custom width to rotate the device frame"
            : isRotated
              ? "Portrait, rotate the frame back"
              : "Landscape, rotate the device frame (breakpoints re-fire at the wider width)"
        }
        className="inline-flex items-center gap-[5px] rounded-full border-none px-[10px] py-[5px] text-[11px] font-semibold tracking-[-0.005em] transition-all"
        style={{
          background: isRotated && !isCustom ? CHROME.surface : "transparent",
          color: isCustom
            ? CHROME.muted2
            : isRotated
              ? CHROME.ink
              : CHROME.muted,
          boxShadow:
            isRotated && !isCustom
              ? "0 1px 3px rgba(0,0,0,0.08), 0 0 0 0.5px rgba(0,0,0,0.04)"
              : "none",
          cursor: isCustom ? "not-allowed" : "pointer",
        }}
      >
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {/* rotate-cw glyph */}
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        Landscape
      </button>
      {/* Reset to natural portrait width */}
      {isCustom || isRotated ? (
        <button
          type="button"
          onClick={() => {
            setDraft(null);
            // Clearing width AND rotation: width→null, then ensure rotation off.
            setPreviewFrameWidth(null);
            if (isRotated) togglePreviewRotated();
          }}
          title="Reset the frame to this device's natural width"
          aria-label="Reset preview frame"
          className="inline-flex items-center justify-center rounded-full border-none transition-all"
          style={{
            width: 22,
            height: 22,
            background: "transparent",
            color: CHROME.muted,
            cursor: "pointer",
          }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}

/** Icon-only preview toggle — matches undo/redo/comments in the right cluster. */
function PreviewToggle({
  previewing,
  setPreviewing,
}: {
  previewing: boolean;
  setPreviewing: (next: boolean) => void;
}) {
  return (
    <TbIconBtn
      onClick={() => setPreviewing(!previewing)}
      title={
        previewing
          ? "Exit preview, show editing tools"
          : "Preview, hide editing tools and interact with the page"
      }
      ariaLabel={previewing ? "Exit preview" : "Preview"}
    >
      {previewing ? (
        <svg
          width={TB_ICON_PX}
          height={TB_ICON_PX}
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
        <svg
          width={TB_ICON_PX}
          height={TB_ICON_PX}
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
    </TbIconBtn>
  );
}

function TbTextBtn({
  children,
  onClick,
  disabled,
  title,
  type = "button",
  buttonRef,
  "aria-expanded": ariaExpanded,
  "aria-haspopup": ariaHasPopup,
  "aria-controls": ariaControls,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit" | "reset";
  /** Anchor ref for a portaled menu (see WorkspaceMenu). */
  buttonRef?: React.RefObject<HTMLButtonElement | null>;
  /** Set on a button that toggles a menu (see WorkspaceMenu). */
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "menu";
  "aria-controls"?: string;
}) {
  return (
    <button
      ref={buttonRef}
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-expanded={ariaExpanded}
      aria-haspopup={ariaHasPopup}
      aria-controls={ariaControls}
      className="inline-flex shrink-0 cursor-pointer items-center gap-[8px] rounded-[10px] border border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/45 disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        height: TB_CONTROL_H,
        padding: "0 12px",
        fontSize: TB_FONT_PX,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        color: CHROME.text,
        background: "transparent",
      }}
      onMouseEnter={(e) => {
        if (!disabled) {
          e.currentTarget.style.background = CHROME.paper2;
          e.currentTarget.style.color = CHROME.ink;
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = CHROME.text;
      }}
    >
      {children}
    </button>
  );
}

/** White bordered pill — Preview / Save per canvas-first mockup. */
function TbOutlineBtn({
  children,
  onClick,
  disabled,
  title,
  type = "button",
  active,
  "aria-pressed": ariaPressed,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  type?: "button" | "submit" | "reset";
  active?: boolean;
  "aria-pressed"?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-pressed={ariaPressed}
      className="inline-flex shrink-0 cursor-pointer items-center gap-[8px] rounded-[10px] border transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        height: TB_CONTROL_H,
        padding: "0 18px",
        fontSize: TB_FONT_PX,
        fontWeight: 500,
        letterSpacing: "-0.005em",
        color: CHROME.ink,
        background: CHROME.surface,
        borderColor: active ? CHROME.accent : CHROME.lineStrong,
        boxShadow: active ? `inset 0 0 0 1px ${CHROME.accent}` : "none",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.borderColor = CHROME.accent;
      }}
      onMouseLeave={(e) => {
        if (!disabled) {
          e.currentTarget.style.borderColor = active
            ? CHROME.accent
            : CHROME.lineStrong;
        }
      }}
    >
      {children}
    </button>
  );
}

type PublishMenuOption =
  | "schedule"
  | "save-draft"
  | "preview"
  | "revisions"
  | "page-settings"
  | "duplicate-page"
  | "unpublish"
  | "pull-from-live:replace"
  | "pull-from-live:above"
  | "pull-from-live:below";

// Perf spine — the `disabled` (was `saving`) prop is gone: this control and
// its menu only open surfaces or fire queue-riding actions, so greying it
// during routine autosaves was pure friction (see the render-site comment).
function PublishSplitButton({
  onPublish,
  onMenuSelect,
}: {
  onPublish: () => void;
  onMenuSelect: (opt: PublishMenuOption) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const publishMenuId = useId();
  const publishMenuTriggerId = useId();
  // Ref on the caret trigger so we can anchor the menu with position:fixed,
  // escaping the topbar's overflow-x-auto scroll container (F7 fix).
  const caretRef = useRef<HTMLButtonElement>(null);
  // Pixel coords for the fixed-position menu: right edge aligned to trigger's
  // right edge, top just below the trigger, clamped inside the viewport.
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);

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

  useEffect(() => {
    if (!menuOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setMenuOpen(false);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [menuOpen]);

  return (
    <div className="relative shrink-0" data-publish-split>
      <div
        className="inline-flex items-stretch overflow-hidden rounded-[10px]"
        role="group"
        aria-label="Publish"
        style={{
          height: TB_CONTROL_H,
          background: CHROME.accent,
          boxShadow: "0 1px 2px rgba(124, 58, 237, 0.28)",
        }}
      >
        <button
          type="button"
          onClick={onPublish}
          title="Review publish checks in the drawer, then publish your draft to the live site"
          className="inline-flex cursor-pointer items-center gap-[8px] border-none text-[14px] font-semibold tracking-[-0.005em] text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ padding: "0 18px 0 20px", background: "transparent" }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M12 13V7" />
            <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
            <path d="m8 17 4-4 4 4" />
          </svg>
          Publish
        </button>
        <span
          aria-hidden
          style={{ width: 1, background: "rgba(255,255,255,0.18)" }}
        />
        <button
          type="button"
          ref={caretRef}
          id={publishMenuTriggerId}
          onClick={() => {
            setMenuOpen((o) => {
              const next = !o;
              if (next && caretRef.current) {
                const rect = caretRef.current.getBoundingClientRect();
                const MENU_W = 240;
                const GAP = 4;
                // Anchor right edge of menu to right edge of trigger; clamp
                // so left edge never goes negative and right edge never
                // exceeds the viewport.
                const rightFromViewport = Math.max(
                  0,
                  window.innerWidth - rect.right,
                );
                setMenuPos({
                  top: rect.bottom + GAP,
                  right: Math.min(
                    rightFromViewport,
                    window.innerWidth - MENU_W - 8,
                  ),
                });
              }
              return next;
            });
          }}
          aria-label="Publish options"
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          aria-controls={publishMenuId}
          className="inline-flex cursor-pointer items-center justify-center border-none transition hover:bg-white/10"
          style={{
            width: 36,
            background: "transparent",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          <svg
            width="11"
            height="11"
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

      {menuOpen && menuPos ? (
        <PortaledOverlay>
        <div
          id={publishMenuId}
          role="menu"
          data-publish-split
          aria-labelledby={publishMenuTriggerId}
          className="z-[120] min-w-[240px] max-w-[calc(100vw-24px)] rounded-[10px] p-[6px] text-[12.5px]"
          style={{
            position: "fixed",
            top: menuPos.top,
            right: menuPos.right,
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            boxShadow:
              "0 24px 64px -16px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(24,24,27,0.07)",
          }}
        >
          {/* Save draft */}
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
            }
            title="Save draft"
            description="Checkpoint without publishing"
            shortcut="⌘S"
            onClick={() => { onMenuSelect("save-draft"); setMenuOpen(false); }}
          />
          {/* Preview */}
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            }
            title="Preview"
            description="View page as a visitor"
            onClick={() => { onMenuSelect("preview"); setMenuOpen(false); }}
          />
          <div
            role="separator"
            style={{ height: 1, background: CHROME.line, margin: "4px 2px" }}
          />
          {/* Schedule */}
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
            role="separator"
            style={{ height: 1, background: CHROME.line, margin: "4px 2px" }}
          />
          {/* Revision history */}
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M3 3v5h5" />
                <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
                <polyline points="12 7 12 12 15 15" />
              </svg>
            }
            title="Revision history"
            description="Browse and restore past saves"
            onClick={() => { onMenuSelect("revisions"); setMenuOpen(false); }}
          />
          <div
            role="separator"
            style={{ height: 1, background: CHROME.line, margin: "4px 2px" }}
          />
          {/* Pull from live: Replace */}
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            }
            title="Pull from live: Replace"
            description="Replace your draft with the live homepage"
            onClick={() => { onMenuSelect("pull-from-live:replace"); setMenuOpen(false); }}
          />
          {/* Pull from live: Add above */}
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            }
            title="Pull from live: Add above"
            description="Add the live homepage blocks above your draft"
            onClick={() => { onMenuSelect("pull-from-live:above"); setMenuOpen(false); }}
          />
          {/* Pull from live: Add below */}
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            }
            title="Pull from live: Add below"
            description="Add the live homepage blocks below your draft"
            onClick={() => { onMenuSelect("pull-from-live:below"); setMenuOpen(false); }}
          />
          {/* Page settings */}
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            }
            title="Page settings"
            description="SEO, URL, metadata"
            onClick={() => { onMenuSelect("page-settings"); setMenuOpen(false); }}
          />
          {/* Duplicate page */}
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            }
            title="Duplicate page"
            description="Clone this page to a new draft"
            onClick={() => { onMenuSelect("duplicate-page"); setMenuOpen(false); }}
          />
          <div
            role="separator"
            style={{ height: 1, background: CHROME.line, margin: "4px 2px" }}
          />
          {/* Unpublish / Archive */}
          <MenuItem
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
              </svg>
            }
            title="Unpublish / Archive"
            description="Take this page offline"
            onClick={() => { onMenuSelect("unpublish"); setMenuOpen(false); }}
          />
        </div>
        </PortaledOverlay>
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
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        }
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
 * BreakpointsPopover — custom viewport tiers beside the device switcher.
 *
 * Revisions, assets, collections, and templates now launch from the left
 * command dock; breakpoint editing stays in the topbar center cluster per
 * the canvas-first mockup.
 */
function BreakpointsPopover() {
  const [open, setOpen] = useState(false);
  const [breakpointDraft, setBreakpointDraft] = useState<BuilderBreakpoint[]>(() =>
    [...DEFAULT_BUILDER_BREAKPOINTS],
  );
  const liveBreakpoints = useBuilderBreakpoints();
  const popoverId = useId();
  const triggerId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-breakpoints-popover]")) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  useEffect(() => {
    if (open) {
      setBreakpointDraft([...liveBreakpoints]);
    }
  }, [open, liveBreakpoints]);

  return (
    <div className="relative shrink-0" data-breakpoints-popover>
      <TbIconBtn
        id={triggerId}
        title="Breakpoints, custom screen sizes"
        ariaLabel="Breakpoints"
        ariaExpanded={open}
        ariaHaspopup="dialog"
        ariaControls={popoverId}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M8 5v14" />
          <path d="M16 5v14" />
        </svg>
      </TbIconBtn>

      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-labelledby={triggerId}
          className="absolute left-1/2 top-[44px] z-[120] w-[280px] -translate-x-1/2 rounded-[10px] p-3"
          style={{
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            boxShadow:
              "0 24px 64px -16px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(24,24,27,0.07)",
          }}
        >
          <p
            className="mb-2"
            style={{ fontSize: 10.5, color: CHROME.muted, lineHeight: 1.35 }}
          >
            Min-width tiers for responsive style editing and device preview frames.
          </p>
          <div className="flex max-h-[200px] flex-col gap-1 overflow-y-auto">
            {breakpointDraft.map((bp, index) => (
              <div key={`${bp.id}-${index}`} className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={bp.label}
                  onChange={(e) => {
                    const label = e.target.value;
                    setBreakpointDraft((rows) =>
                      rows.map((row, i) => (i === index ? { ...row, label } : row)),
                    );
                  }}
                  aria-label={`Breakpoint ${index + 1} label`}
                  className="min-w-0 flex-1 rounded border px-1.5 py-1 text-[11px]"
                  style={{ borderColor: CHROME.line, background: CHROME.surface }}
                />
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={bp.minWidth}
                  onChange={(e) => {
                    const minWidth = Number(e.target.value);
                    if (!Number.isFinite(minWidth) || minWidth < 0) return;
                    setBreakpointDraft((rows) =>
                      rows.map((row, i) =>
                        i === index ? { ...row, minWidth } : row,
                      ),
                    );
                  }}
                  aria-label={`Breakpoint ${index + 1} min width`}
                  className="w-[68px] rounded border px-1.5 py-1 text-[11px]"
                  style={{ borderColor: CHROME.line, background: CHROME.surface }}
                />
                <button
                  type="button"
                  aria-label={`Remove breakpoint ${bp.label}`}
                  className="cursor-pointer rounded border-none bg-transparent px-1 text-[11px]"
                  style={{ color: CHROME.muted }}
                  onClick={() =>
                    setBreakpointDraft((rows) => rows.filter((_, i) => i !== index))
                  }
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <button
              type="button"
              className="cursor-pointer rounded-md border px-2 py-1 text-[10.5px] font-medium"
              style={{ borderColor: CHROME.line, background: CHROME.surface }}
              onClick={() =>
                setBreakpointDraft((rows) => [
                  ...rows,
                  {
                    id: `custom-${rows.length + 1}`,
                    label: `Tier ${rows.length + 1}`,
                    minWidth: 1440,
                  },
                ])
              }
            >
              Add tier
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-md border px-2 py-1 text-[10.5px] font-medium"
              style={{ borderColor: CHROME.line, background: CHROME.surface }}
              onClick={() => setBreakpointDraft([...DEFAULT_BUILDER_BREAKPOINTS])}
            >
              Reset defaults
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-md border-none px-2 py-1 text-[10.5px] font-semibold text-white"
              style={{ background: CHROME.accent }}
              onClick={() => {
                const cleaned = breakpointDraft.filter(
                  (bp) => bp.label.trim() !== "" && Number.isFinite(bp.minWidth),
                );
                saveCustomBreakpoints(
                  cleaned.length > 0 ? cleaned : [...DEFAULT_BUILDER_BREAKPOINTS],
                );
                notifyBuilderBreakpointsChanged();
                setOpen(false);
              }}
            >
              Save
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Workspace quick links shown beside "Exit to live site".
 *
 * The editor used to be a dead end: no route back to the dashboard at all, so
 * an operator had to hand-edit the URL (admin lives at `/{slug}/admin`, NOT
 * under the `/w/` public prefix). Every entry here is a real route verified to
 * exist under app/(workspace)/[tenantSlug]/admin/.
 */
const WORKSPACE_QUICK_LINKS: ReadonlyArray<{
  href: string;
  label: Parameters<ReturnType<typeof useEditorLocale>["t"]>[0];
  hint: Parameters<ReturnType<typeof useEditorLocale>["t"]>[0];
}> = [
  { href: "", label: "Dashboard", hint: "Overview of what needs you" },
  { href: "/messages", label: "Messages", hint: "Inquiries and replies" },
  { href: "/roster", label: "Roster", hint: "Your talent" },
  { href: "/clients", label: "Clients", hint: "People who book you" },
  { href: "/calendar", label: "Calendar", hint: "Bookings and holds" },
  { href: "/media", label: "Media", hint: "Photos and files" },
  { href: "/site", label: "Website", hint: "Pages and site settings" },
];

/**
 * `WorkspaceMenu` — the "go somewhere else in the workspace" half of the exit
 * cluster. Split from the exit button itself so the primary action (leave edit
 * mode, see the live site) stays a single click and the navigation options do
 * not bury it.
 *
 * Renders nothing when there is no workspace slug (Builder Lab, platform
 * surfaces): a menu of links that would all 404 is worse than no menu.
 */
function WorkspaceMenu({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const { t } = useEditorLocale();
  // Fixed-position anchor + portal to <body>, same as the page picker and the
  // publish-split menu: the topbar is overflow-y-hidden AND its backdrop-filter
  // makes it the containing block for fixed descendants, so an in-tree menu is
  // clipped to the 60px bar no matter what position it uses. The portal is
  // load-bearing.
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-workspace-menu]")) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  return (
    <div data-workspace-menu="" style={{ position: "relative", flexShrink: 0 }}>
      <TbTextBtn
        buttonRef={triggerRef}
        onClick={() =>
          setOpen((v) => {
            const next = !v;
            if (next && triggerRef.current) {
              const rect = triggerRef.current.getBoundingClientRect();
              setMenuPos({ top: rect.bottom + 6, left: rect.left });
            }
            return next;
          })
        }
        title={t("Go to your workspace dashboard")}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={open ? menuId : undefined}
      >
        <svg
          width={TB_ICON_PX}
          height={TB_ICON_PX}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
        {t("Workspace")}
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          style={{
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 140ms ease",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </TbTextBtn>
      {open && menuPos ? (
        <PortaledOverlay>
        <div
          id={menuId}
          role="menu"
          // The portal mounts to <body>, OUTSIDE both markers the editor relies
          // on, so BOTH must be re-declared here or the links silently do
          // nothing:
          //  - data-workspace-menu: the outside-click handler's closest() match
          //    (else mousedown unmounts the menu before the click lands).
          //  - data-edit-chrome: canvas-link-interceptor preventDefault()s every
          //    a[href] click that is not inside editor chrome.
          data-workspace-menu=""
          data-edit-chrome=""
          aria-label={t("Workspace quick links")}
          style={{
            position: "fixed",
            top: menuPos.top,
            left: menuPos.left,
            minWidth: 232,
            padding: 5,
            borderRadius: CHROME_RADII.lg,
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            boxShadow: CHROME_SHADOWS.panel,
            zIndex: 120,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {WORKSPACE_QUICK_LINKS.map((item) => (
            <button
              key={item.href || "dashboard"}
              type="button"
              role="menuitem"
              // A plain <a> does NOT work here: canvas-link-interceptor
              // preventDefault()s anchor clicks in edit mode. Leaving the
              // editor is a full document navigation by design — the edit
              // shell has to tear down, so router.push would be wrong too.
              onClick={() => {
                setOpen(false);
                window.location.assign(
                  `${resolveWorkspaceAdminBaseForLocation(slug, window.location)}${item.href}`,
                );
              }}
              style={{
                display: "block",
                width: "100%",
                padding: "7px 9px",
                border: "none",
                background: "transparent",
                borderRadius: 8,
                textAlign: "left",
                cursor: "pointer",
                color: CHROME.ink,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = CHROME.paper2;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{ display: "block", fontSize: 12.5, fontWeight: 600 }}
              >
                {t(item.label)}
              </span>
              <span
                style={{
                  display: "block",
                  marginTop: 1,
                  fontSize: 10.5,
                  color: CHROME.muted,
                }}
              >
                {t(item.hint)}
              </span>
            </button>
          ))}
        </div>
        </PortaledOverlay>
      ) : null}
    </div>
  );
}

function ExitButton() {
  const { pending } = useFormStatus();
  return (
    <TbTextBtn
      type="submit"
      disabled={pending}
      title="Exit edit mode and view your live published site"
    >
      <svg
        width={TB_ICON_PX}
        height={TB_ICON_PX}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      {pending ? "Exiting…" : "Exit to live site"}
    </TbTextBtn>
  );
}

/**
 * Wraps the exit-edit form so we can intercept submit and confirm with
 * the operator when there are un-persisted inspector edits or a save
 * is mid-flight. `preventDefault` short-circuits the React 19 server-
 * action pipeline the same way it cancels native submits.
 */
function ExitForm({ dirty }: { dirty: boolean }) {
  const editCtx = useMaybeEditContext();
  // Perf spine (save-cycle bridge) — read `saving` here so only this form
  // wakes on a save flip (it decides whether exit must flush first).
  const saving = useSaving();
  // CANVAS-2 — flush the autosave queue before tearing down the EditProvider
  // instead of prompting with a blocking confirm(). When there are un-persisted
  // edits (or a save is mid-flight) we intercept the submit, AWAIT the shared
  // flush so the debounced draft lands, then re-submit the form to run the
  // server action. `flushingRef` lets the re-submit pass straight through
  // without re-intercepting.
  const flushingRef = useRef(false);
  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    if (flushingRef.current) return; // re-submit after the flush — let it run
    if (!dirty && !saving) return;
    if (!editCtx) return; // no provider mounted → nothing to flush, exit as-is
    e.preventDefault();
    const form = e.currentTarget;
    flushingRef.current = true;
    void editCtx
      .flushBuilderTreeSave()
      .catch(() => {
        // Flush failure (e.g. version conflict) still lets the operator exit;
        // the draft state is preserved server-side and surfaced on next open.
      })
      .finally(() => {
        form.requestSubmit();
      });
  };
  return (
    <form action={exitEditModeAction} onSubmit={handleSubmit}>
      <ExitButton />
    </form>
  );
}

/**
 * ShareButton — standalone "Share preview link" affordance for the right
 * cluster (next to Comments). Mints a private draft URL via the same
 * `onShare` handler the topbar already receives; the popover carries a label
 * field + TTL choice and copies the generated link to the clipboard.
 *
 * Surfaced as its own button (2026-06 canvas-first redesign) so collaboration
 * actions live beside Comments rather than buried in an overflow menu.
 */
function ShareButton({
  onShare,
}: {
  onShare: (opts: {
    label?: string;
    ttlSeconds?: number;
  }) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [ttl, setTtl] =
    useState<(typeof SHARE_TTL_CHOICES)[number]["id"]>(SHARE_TTL_DEFAULT);
  const [busy, setBusy] = useState(false);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-share-button]")) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setLabel("");
      setTtl(SHARE_TTL_DEFAULT);
    }
  }, [open]);

  async function handleGenerate() {
    if (busy) return;
    setBusy(true);
    try {
      const ttlSeconds = SHARE_TTL_CHOICES.find((c) => c.id === ttl)?.seconds;
      const url = await onShare({ label: label.trim() || undefined, ttlSeconds });
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
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0" data-share-button>
      <TbIconBtn
        title="Share preview link"
        label="Share"
        ariaExpanded={open}
        ariaHaspopup="dialog"
        ariaControls={popoverId}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
          <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
        </svg>
      </TbIconBtn>
      {open ? (
        <div
          id={popoverId}
          role="dialog"
          aria-label="Share a preview link"
          className="absolute right-0 top-[44px] z-[120] w-[280px] rounded-[10px] p-3"
          style={{
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            boxShadow:
              "0 24px 64px -16px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(24,24,27,0.07)",
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: CHROME.ink }}>
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
            value={label}
            onChange={(e) => setLabel(e.target.value)}
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
                void handleGenerate();
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
              const active = c.id === ttl;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTtl(c.id)}
                  className="cursor-pointer"
                  style={{
                    padding: "7px 0",
                    fontSize: 12,
                    fontWeight: 500,
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
            onClick={() => void handleGenerate()}
            disabled={busy}
            className="cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
            style={{
              width: "100%",
              marginTop: 10,
              padding: "9px 12px",
              fontSize: 12.5,
              fontWeight: 600,
              color: "#fff",
              background: CHROME.accent,
              border: `1px solid ${CHROME.accent}`,
              borderRadius: 6,
              letterSpacing: "-0.005em",
            }}
          >
            {busy ? "Generating…" : "Generate & copy link"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ── Lab Exit Button ───────────────────────────────────────────────────────────

/**
 * Alternative exit button for the `"lab"` header variant.
 * Calls a JS callback instead of submitting the server-action form, so it
 * works when there's no live-site storefront to navigate back to.
 */
function LabExitButton({
  onExit,
  exitLabel = "Exit",
}: {
  onExit?: () => void;
  exitLabel?: string;
}) {
  return (
    <TbTextBtn
      type="button"
      onClick={onExit}
      title={exitLabel}
    >
      <svg
        width={TB_ICON_PX}
        height={TB_ICON_PX}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <line x1="19" y1="12" x2="5" y2="12" />
        <polyline points="12 19 5 12 12 5" />
      </svg>
      {exitLabel}
    </TbTextBtn>
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
  // Perf spine — `saving` / `lastDraftSavedAt` props removed: the leaf
  // components that need them (SaveStatus, ExitForm, SaveDraftButton)
  // subscribe to the save-cycle bridge directly.
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onPublish: () => void;
  /** Open the Schedule drawer (Phase 12 — Publish-split-button menu option). */
  onSchedule?: () => void;
  /** Open the Comments drawer (Phase 11 — speech-bubble icon in the right cluster). */
  onComments?: () => void;
  /** Live count of unresolved threads, surfaced as a badge on the icon. */
  commentsBadge?: number;
  /**
   * Open (toggle) the ⌘K command palette. Wired to the same handler the
   * keyboard shortcut fires in EditShell, surfaced as a discoverable pill so
   * the palette isn't keyboard-only. Omit → the pill is not rendered.
   */
  onOpenPalette?: () => void;
  /**
   * Open the keyboard-shortcuts reference overlay (the `?` shortcut). Surfaced
   * as a discoverable `?` glyph so the overlay isn't keyboard-only. Omit →
   * the glyph is not rendered.
   */
  onOpenShortcuts?: () => void;
  /**
   * Save an explicit draft checkpoint. Resolves with the server timestamp
   * the surrounding chrome surfaces in its transient confirmation toast.
   * The button is disabled while a save is in flight.
   */
  onSaveDraft?: () => void | Promise<unknown>;
  /**
   * WS4-TASK1: Save a named checkpoint. The topbar will show an inline
   * label prompt before calling this. When present the "Save as named draft…"
   * menu item opens a small modal instead of firing `onSaveDraft` directly.
   */
  onSaveNamedDraft?: (label: string) => Promise<{ ok: boolean; error?: string }>;
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
  /** Opens the Pages dropdown when incremented (deep-link `?panel=pages`). */
  pagesPickerOpenNonce?: number;
  /** The locale the editor is currently bound to. Drives the locale-switcher
   *  pill's active state. Optional — single-locale tenants render no pill. */
  activeLocale?: string;
  /**
   * Tenant default storefront locale — determines which locale gets no URL
   * prefix (must match `loadTenantLocaleSettings` / middleware).
   */
  defaultLocale?: string;
  /** Locales the active tenant publishes. Empty/single-entry → no switcher. */
  availableLocales?: ReadonlyArray<string>;
  /**
   * When the live storefront last had this page published (`cms_pages.published_at`).
   * Null/undefined = never published for this row.
   */
  liveSitePublishedAt?: string | null;

  // ── WS3 — Publish dropdown wiring ────────────────────────────────────────

  /**
   * Open the Revisions drawer. Wired to context `openRevisions`.
   * Omit → the Revision history menu item is still shown but is a no-op,
   * so call-sites that haven't threaded it yet degrade gracefully.
   */
  onRevisions?: () => void;
  /**
   * Open the Page Settings drawer. Wired to context `openPageSettings`.
   */
  onPageSettings?: () => void;
  /**
   * Open the All-Pages panel / pages picker. Wired to context `requestPagesPickerOpen`.
   */
  onDuplicatePage?: () => void;
  /**
   * Open the Publish drawer to the Unpublish/Archive view.
   * Wired to context `openPublish` (same drawer; the drawer handles the
   * Unpublish/Archive sub-state internally).
   */
  onUnpublish?: () => void;

  // ── WS3 — Header variants (consumed by WS5 Builder Lab) ──────────────────

  /**
   * Header variant. Defaults to `"live"` which renders the existing storefront
   * editor header byte-for-byte identically. `"lab"` is consumed by WS5 to
   * swap in the Builder Lab chrome (ephemeral adapter; no live-site exit).
   *
   * When absent the header defaults to `"live"` — fully back-compat.
   */
  headerVariant?: "live" | "lab";
  /**
   * Custom exit handler. When provided AND `headerVariant === "lab"`, replaces
   * the form-action exit with a JS callback (e.g. navigate back to the Platform
   * Admin shell). Ignored when `headerVariant === "live"`.
   */
  onExit?: () => void;
  /**
   * Label shown on the Exit button when `headerVariant === "lab"`.
   * Defaults to `"Exit"`. Ignored when `headerVariant === "live"`.
   */
  exitLabel?: string;
  /**
   * A small chip rendered beside the page title when `headerVariant === "lab"`.
   * Typically the talent/workspace name the Builder Lab is previewing.
   * Ignored when `headerVariant === "live"`.
   */
  previewSubjectChip?: React.ReactNode;
  /** Extra lab-only topbar chrome after the subject chip (e.g. the
   *  component-preview lock + settings buttons). Ignored when not "lab". */
  labHeaderActions?: React.ReactNode;
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

/**
 * WS1-A — live collaborator avatars in the topbar. Renders the (previously
 * orphaned) `RailPresenceStack` only when someone ELSE is on the page, so a solo
 * editor sees no clutter. Gated behind `NEXT_PUBLIC_BUILDER_PRESENCE`.
 */
function TopBarPresence() {
  if (!isBuilderPresenceEnabled()) return null;
  return <TopBarPresenceInner />;
}

function TopBarPresenceInner() {
  const { editors } = usePagePresence();
  if (editors.length <= 1) return null;
  return (
    <div className="flex shrink-0 items-center pr-1" aria-label="Editors on this page">
      <RailPresenceStack />
    </div>
  );
}

export function TopBar({
  device,
  setDevice,
  previewing,
  setPreviewing,
  dirty,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onPublish,
  onSchedule,
  onComments,
  commentsBadge,
  onSaveDraft,
  onSaveNamedDraft,
  onShare,
  pageTitle,
  pageId,
  pagesPickerOpenNonce,
  activeLocale,
  defaultLocale = DEFAULT_PLATFORM_LOCALE,
  availableLocales = [],
  liveSitePublishedAt = null,
  onRevisions,
  onPageSettings,
  onDuplicatePage,
  onUnpublish,
  headerVariant = "live",
  onExit,
  exitLabel = "Exit",
  previewSubjectChip,
  labHeaderActions,
}: TopBarProps) {
  const editCtx = useMaybeEditContext();
  // Workspace slug for the dashboard quick-links menu. Null on Builder Lab and
  // platform surfaces, where `/{slug}/admin/*` would not resolve.
  const workspaceSlug = editCtx?.workspaceMembershipSlug ?? null;

  // WS5 — seed the in-session content-locale bridge from the page's resolved
  // locale + tenant default on first paint (and whenever they change). The
  // ContentLocaleToggle + canvas + Content panel all read this bridge; seeding
  // here means the canvas resolves overlays for the correct locale immediately,
  // even before the operator touches the toggle. Re-runs only on a real change.
  const seededLocale = activeLocale || defaultLocale;
  useEffect(() => {
    const ordered = [
      defaultLocale,
      ...availableLocales.filter((l) => l !== defaultLocale),
    ];
    publishActiveContentLocale({
      locale: seededLocale,
      defaultLocale,
      chain: buildContentFallbackChain(seededLocale, defaultLocale, ordered),
    });
  }, [seededLocale, defaultLocale, availableLocales]);

  // WS4-TASK1: Named checkpoint prompt state.
  const [namedDraftOpen, setNamedDraftOpen] = useState(false);
  const [namedDraftLabel, setNamedDraftLabel] = useState("");
  const [namedDraftPending, setNamedDraftPending] = useState(false);
  const [namedDraftError, setNamedDraftError] = useState<string | null>(null);

  async function handleNamedDraftSubmit() {
    if (!onSaveNamedDraft) return;
    const label = namedDraftLabel.trim();
    if (!label) return;
    setNamedDraftPending(true);
    setNamedDraftError(null);
    const res = await onSaveNamedDraft(label);
    setNamedDraftPending(false);
    if (res.ok) {
      setNamedDraftOpen(false);
      setNamedDraftLabel("");
    } else {
      setNamedDraftError(res.error ?? "Save failed. Try again.");
    }
  }

  function handleMenuSelect(opt: PublishMenuOption) {
    if (opt === "schedule") {
      if (onSchedule) onSchedule();
      else void improntaLog("edit_chrome_topbar.info", {
        message: "[topbar] schedule publish: no handler wired",
      });
    } else if (opt === "save-draft") {
      // WS4-TASK1 (main): if onSaveNamedDraft is wired, open the label prompt
      // (named checkpoints) instead of firing onSaveDraft silently.
      if (onSaveNamedDraft) {
        setNamedDraftLabel("");
        setNamedDraftError(null);
        setNamedDraftOpen(true);
      } else if (onSaveDraft) {
        void onSaveDraft();
      }
    } else if (opt === "preview") {
      setPreviewing(true);
    } else if (opt === "revisions") {
      if (onRevisions) onRevisions();
      else void improntaLog("edit_chrome_topbar.info", {
        message: "[topbar] revision history: no handler wired",
      });
    } else if (opt === "page-settings") {
      if (onPageSettings) onPageSettings();
      else void improntaLog("edit_chrome_topbar.info", {
        message: "[topbar] page settings: no handler wired",
      });
    } else if (opt === "duplicate-page") {
      if (onDuplicatePage) onDuplicatePage();
      else void improntaLog("edit_chrome_topbar.info", {
        message: "[topbar] duplicate page: no handler wired",
      });
    } else if (opt === "unpublish") {
      // Opens the Publish drawer — the drawer handles Unpublish/Archive state.
      if (onUnpublish) onUnpublish();
      else if (onPublish) onPublish();
      else void improntaLog("edit_chrome_topbar.info", {
        message: "[topbar] unpublish/archive: no handler wired",
      });
    } else if (
      opt === "pull-from-live:replace" ||
      opt === "pull-from-live:above" ||
      opt === "pull-from-live:below"
    ) {
      const mode =
        opt === "pull-from-live:replace"
          ? "replace"
          : opt === "pull-from-live:above"
            ? "above"
            : "below";
      void runPullFromLive(mode);
    } else if (opt === "discard") {
      // Phase 4 — discard draft (revert to live snapshot)
      void improntaLog("edit_chrome_topbar.info", {
        message: "[topbar] discard draft: not yet implemented",
      });
    }
  }

  // Pull from live: import the tenant's LIVE published homepage into the draft.
  // DRAFT-ONLY (the lib op never touches the published snapshot or busts the
  // public cache). Runs from the `...` menu (not the advisory-heavy Publish
  // drawer) so it never main-thread-freezes on large homes. Mirrors the
  // publish-drawer's handleCopyFromLive: confirm -> safeAction -> refresh.
  async function runPullFromLive(mode: "replace" | "above" | "below") {
    if (!editCtx) return;
    // Only Replace discards the current draft, so only it needs a confirm.
    // Add above / add below are additive (a single undo reverts them), so they
    // run in one click without a prompt.
    if (
      mode === "replace" &&
      typeof window !== "undefined" &&
      !window.confirm(
        "Replace your draft with the live homepage? Discards unsaved draft edits.",
      )
    ) {
      return;
    }
    const res = await safeAction(
      () => copyPublishedHomepageAction({ locale: editCtx.locale, mode }),
      {
        name: "pullFromLiveHomepage",
        fallback: {
          ok: false as const,
          error:
            "Network error. Couldn't pull from live. Check your connection and try again.",
          code: "network",
        },
      },
    );
    if (res.ok) {
      // Reload the editor from the server (same refresh used after copy /
      // restore / publish) so the canvas reflects the updated draft.
      await editCtx.refreshComposition();
      return;
    }
    editCtx.reportMutationError(res.error);
  }

  return (
    <div
      data-edit-topbar
      className="fixed inset-x-0 top-0 z-[90] overflow-x-auto overflow-y-hidden"
      style={{
        height: TOPBAR_H,
        background: "rgba(249, 249, 251, 0.96)",
        backdropFilter: "blur(16px) saturate(140%)",
        WebkitBackdropFilter: "blur(16px) saturate(140%)",
        borderBottom: `1px solid ${CHROME.line}`,
        WebkitOverflowScrolling: "touch",
      }}
    >
      {/* BUG-010 — narrow viewports: the cluster exceeds `100vw`; without a
          horizontal scroll parent, Publish/Exit sit outside the viewport and
          Playwright (and operators) cannot reach them. Inner row keeps natural
          width; outer bar scrolls. */}
      <div className="flex h-full min-w-max items-center gap-[12px] px-[20px]">
      {/* ── Left cluster — page-level navigation ── */}
      {headerVariant === "lab" ? (
        <LabExitButton onExit={onExit} exitLabel={exitLabel} />
      ) : (
        <>
          <ExitForm dirty={dirty} />
          {workspaceSlug ? <WorkspaceMenu slug={workspaceSlug} /> : null}
        </>
      )}
      <TbDivider />
      <PagePicker
        title={pageTitle ?? "Homepage"}
        pageId={pageId}
        dirty={dirty}
        pagesPickerOpenNonce={pagesPickerOpenNonce}
      />
      {headerVariant === "lab" && previewSubjectChip ? (
        <>{previewSubjectChip}</>
      ) : null}
      {headerVariant === "lab" && labHeaderActions ? (
        <>{labHeaderActions}</>
      ) : null}
      {availableLocales.length > 1 ? (
        <ContentLocaleToggle
          defaultLocale={defaultLocale}
          availableLocales={availableLocales}
        />
      ) : null}

      {/* ── Spacer ── */}
      <span className="flex-1" />

      {/* ── Center — device preview controls ── */}
      <div className="inline-flex shrink-0 items-center gap-2">
        <ViewportSwitcher
          device={device}
          setDevice={setDevice}
          previewFrame={editCtx?.previewFrame ?? null}
          setPreviewFrameWidth={editCtx?.setPreviewFrameWidth}
          togglePreviewRotated={editCtx?.togglePreviewRotated}
          mobileEditMode={editCtx?.mobileEditMode}
          setMobileEditMode={editCtx?.setMobileEditMode}
        />
      </div>

      {/* ── Spacer ── */}
      <span className="flex-1" />

      {/* ── Right cluster — history · collaboration · save & publish ──
       * Page-level tools only. Element/section editing lives in the inspector
       * and the floating toolbar; tool panels launch from the left command
       * dock (Add · Pages · Structure · Design · Assets · Help). Search lives
       * only in the ⌘K command palette; Page Settings has its single home in
       * the publish menu below.
       */}
      <TbIconBtn title="Undo (⌘Z)" onClick={onUndo} disabled={!canUndo}>
        <svg width={TB_ICON_PX} height={TB_ICON_PX} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 7v6h6" />
          <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
        </svg>
      </TbIconBtn>
      <TbIconBtn title="Redo (⇧⌘Z)" onClick={onRedo} disabled={!canRedo}>
        <svg width={TB_ICON_PX} height={TB_ICON_PX} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 7v6h-6" />
          <path d="M3 17a9 9 0 0 1 15-6.7l3 2.7" />
        </svg>
      </TbIconBtn>

      <TbIconBtn
        title="Comments"
        onClick={onComments}
        badge={commentsBadge}
      >
        <svg width={TB_ICON_PX} height={TB_ICON_PX} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </TbIconBtn>
      <PreviewToggle previewing={previewing} setPreviewing={setPreviewing} />

      {onSaveDraft ? (
        <SaveDraftButton onSaveDraft={onSaveDraft} />
      ) : null}
      <TopBarPresence />
      <SaveStatus
        dirty={dirty}
        liveSitePublishedAt={liveSitePublishedAt}
      />

      {/* ── Publish split (primary CTA) ── */}
      {/* Perf spine — no `disabled={saving}` here: the button and its menu
          only OPEN surfaces (publish drawer, schedule, revisions, settings) or
          fire actions that ride the coalesced save queue (save-draft opens the
          named-checkpoint modal, which has its own pending state; pull-from-live
          rides the optimistic tree lane). Greying the primary CTA during
          routine autosaves was pure friction. */}
      <PublishSplitButton
        onPublish={onPublish}
        onMenuSelect={handleMenuSelect}
      />
      </div>

      {/* WS4-TASK1 — Named checkpoint modal (backdrop + dialog). Portaled to
          <body>: the topbar's backdrop-filter establishes a containing block for
          fixed-positioned descendants, and its overflow-y-hidden would otherwise
          clip this full-screen overlay to the ~54px bar. */}
      {namedDraftOpen ? (
        <PortaledOverlay>
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.35)",
            backdropFilter: "blur(3px)",
          }}
          onClick={() => { if (!namedDraftPending) { setNamedDraftOpen(false); } }}
        >
          <div
            style={{
              background: CHROME.surface,
              border: `1px solid ${CHROME.lineMid}`,
              borderRadius: 12,
              boxShadow: "0 8px 32px rgba(0,0,0,0.14)",
              padding: "24px",
              width: 360,
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="named-draft-title"
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span
                id="named-draft-title"
                style={{ fontSize: 14, fontWeight: 700, color: CHROME.ink, letterSpacing: "-0.01em" }}
              >
                Save named checkpoint
              </span>
              <span style={{ fontSize: 12, color: CHROME.muted }}>
                Give this draft a label so you can identify it in the Revisions history.
              </span>
            </div>
            <input
              type="text"
              autoFocus
              maxLength={48}
              placeholder="e.g. Before homepage redesign…"
              value={namedDraftLabel}
              onChange={(e) => setNamedDraftLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && namedDraftLabel.trim() && !namedDraftPending) {
                  void handleNamedDraftSubmit();
                }
                if (e.key === "Escape" && !namedDraftPending) {
                  setNamedDraftOpen(false);
                }
              }}
              disabled={namedDraftPending}
              style={{
                width: "100%",
                background: CHROME.surface2,
                border: `1px solid ${CHROME.violetLine}`,
                borderRadius: 8,
                padding: "8px 12px",
                fontSize: 13,
                color: CHROME.ink,
                outline: "none",
                boxSizing: "border-box",
              }}
              aria-label="Checkpoint label"
            />
            {namedDraftError ? (
              <div style={{ fontSize: 12, color: CHROME.rose }}>
                {namedDraftError}
              </div>
            ) : null}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button
                type="button"
                onClick={() => { if (!namedDraftPending) setNamedDraftOpen(false); }}
                disabled={namedDraftPending}
                style={{
                  height: 32,
                  padding: "0 14px",
                  fontSize: 12,
                  fontWeight: 500,
                  color: CHROME.text2,
                  background: CHROME.surface,
                  border: `1px solid ${CHROME.lineMid}`,
                  borderRadius: 7,
                  cursor: namedDraftPending ? "not-allowed" : "pointer",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { void handleNamedDraftSubmit(); }}
                disabled={namedDraftPending || !namedDraftLabel.trim()}
                style={{
                  height: 32,
                  padding: "0 16px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#fff",
                  background: namedDraftPending || !namedDraftLabel.trim() ? CHROME.muted2 : CHROME.accent,
                  border: "none",
                  borderRadius: 7,
                  cursor: namedDraftPending || !namedDraftLabel.trim() ? "not-allowed" : "pointer",
                }}
              >
                {namedDraftPending ? "Saving…" : "Save checkpoint"}
              </button>
            </div>
          </div>
        </div>
        </PortaledOverlay>
      ) : null}
    </div>
  );
}
