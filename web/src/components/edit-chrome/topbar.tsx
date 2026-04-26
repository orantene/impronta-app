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
        background: CHROME.lineMid,
        margin: "0 4px",
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
      className="relative inline-flex shrink-0 cursor-pointer items-center justify-center rounded-[7px] border border-transparent transition-colors disabled:cursor-not-allowed"
      style={{
        width: 32,
        height: 32,
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
          background: CHROME.ink,
          boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.10)",
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
function PagePicker({ title }: { title: string }) {
  const [open, setOpen] = useState(false);

  // Outside-click dismiss — same pattern as PublishSplitButton.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-page-picker]")) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative shrink-0" data-page-picker>
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
          style={{
            width: 18,
            height: 18,
            background: CHROME.paper2,
            color: CHROME.muted,
          }}
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
          className="absolute left-0 top-[42px] z-[120] min-w-[260px] rounded-[10px] p-[6px]"
          style={{
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            boxShadow:
              "0 24px 64px -16px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(24,24,27,0.07)",
          }}
        >
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
          <div
            role="menuitemradio"
            aria-checked
            className="flex cursor-default items-center gap-[8px] rounded-[6px] px-[10px] py-[7px]"
            style={{ background: CHROME.paper2, color: CHROME.ink }}
          >
            <span
              className="inline-flex shrink-0 items-center justify-center rounded-[4px]"
              style={{ width: 18, height: 18, background: CHROME.surface, color: CHROME.muted }}
              aria-hidden
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
            </span>
            <span className="flex-1 font-semibold tracking-[-0.005em]" style={{ fontSize: 12.5 }}>
              {title || "Homepage"}
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={CHROME.green} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
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

function TbTextBtn({
  children,
  onClick,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="inline-flex shrink-0 cursor-pointer items-center gap-[6px] rounded-[7px] border border-transparent transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      style={{
        height: 32,
        padding: "0 12px",
        fontSize: 12.5,
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
        className="inline-flex items-stretch overflow-hidden rounded-[7px]"
        style={{
          height: 32,
          background: CHROME.ink,
          boxShadow:
            "0 1px 2px rgba(0,0,0,0.10), inset 0 0 0 1px rgba(255,255,255,0.10)",
        }}
      >
        <button
          type="button"
          onClick={onPublish}
          disabled={disabled}
          className="cursor-pointer border-none text-[12.5px] font-semibold tracking-[-0.005em] text-white transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-50"
          style={{ padding: "0 14px", background: "transparent" }}
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
            width: 28,
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
 * Share icon button + popover. Single self-contained surface that the
 * topbar drops into the right-icon cluster: clicking the icon toggles a
 * popover with an optional label input + a TTL choice (1h / 24h / 7d /
 * 30d) and a primary "Generate link" CTA. Submission calls the parent's
 * `onShare(opts)` (returns the absolute URL or null) and on success
 * writes to the clipboard, surfaces an inline "Link copied" success
 * state, and auto-closes after a short delay. Failure paths fall through
 * to the parent's mutation-error toast — the popover does NOT render its
 * own error UI. When `onShare` is undefined the icon is rendered
 * disabled (read-only chrome surface, e.g. unauthenticated preview).
 */
function ShareIconWithPopover({
  onShare,
}: {
  onShare?: (opts: {
    label?: string;
    ttlSeconds?: number;
  }) => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [ttlChoice, setTtlChoice] =
    useState<(typeof SHARE_TTL_CHOICES)[number]["id"]>(SHARE_TTL_DEFAULT);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  // Outside-click close, mirrors PublishSplitButton's pattern.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-share-popover]")) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Reset the form fields whenever the popover closes so the next open
  // starts clean. Preserve `copied=true` for the auto-close grace window
  // so the icon flashes the green check after the popover hides.
  useEffect(() => {
    if (open) {
      setLabel("");
      setTtlChoice(SHARE_TTL_DEFAULT);
    }
  }, [open]);

  async function handleGenerate() {
    if (!onShare || busy) return;
    setBusy(true);
    try {
      const ttlSeconds = SHARE_TTL_CHOICES.find((c) => c.id === ttlChoice)
        ?.seconds;
      const url = await onShare({
        label: label.trim() || undefined,
        ttlSeconds,
      });
      if (!url) return;
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setOpen(false);
          window.setTimeout(() => setCopied(false), 2200);
        } catch {
          window.prompt("Share link", url);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative shrink-0" data-share-popover>
      <TbIconBtn
        title={copied ? "Link copied" : "Share preview link"}
        onClick={onShare ? () => setOpen((o) => !o) : undefined}
        disabled={!onShare}
      >
        {copied ? (
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke={CHROME.green}
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
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
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
          </svg>
        )}
      </TbIconBtn>

      {open ? (
        <div
          className="absolute right-0 top-[42px] z-[120] w-[300px] rounded-[10px] p-[14px]"
          style={{
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            boxShadow:
              "0 24px 64px -16px rgba(0,0,0,0.20), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px rgba(24,24,27,0.07)",
          }}
        >
          <div
            style={{
              fontSize: 12.5,
              fontWeight: 600,
              color: CHROME.ink,
              letterSpacing: "-0.005em",
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

          <label
            style={{
              display: "block",
              marginTop: 12,
              fontSize: 11,
              fontWeight: 600,
              color: CHROME.text,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            Label{" "}
            <span
              style={{
                fontWeight: 500,
                color: CHROME.muted,
                textTransform: "none",
                letterSpacing: 0,
              }}
            >
              (optional)
            </span>
          </label>
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Q3 review draft"
            maxLength={80}
            spellCheck={false}
            style={{
              width: "100%",
              marginTop: 4,
              padding: "7px 9px",
              fontSize: 12.5,
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
            style={{
              marginTop: 12,
              fontSize: 11,
              fontWeight: 600,
              color: CHROME.text,
              letterSpacing: "0.02em",
              textTransform: "uppercase",
            }}
          >
            Expires in
          </div>
          <div
            role="radiogroup"
            aria-label="Link expiration"
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr 1fr",
              gap: 4,
              marginTop: 4,
            }}
          >
            {SHARE_TTL_CHOICES.map((c) => {
              const active = c.id === ttlChoice;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setTtlChoice(c.id)}
                  className="cursor-pointer transition"
                  style={{
                    padding: "6px 0",
                    fontSize: 11.5,
                    fontWeight: 500,
                    background: active ? CHROME.ink : CHROME.paper,
                    color: active ? "#fff" : CHROME.text,
                    border: `1px solid ${active ? CHROME.ink : CHROME.line}`,
                    borderRadius: 6,
                    letterSpacing: "-0.005em",
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 6,
              justifyContent: "flex-end",
            }}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={busy}
              className="cursor-pointer transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                padding: "7px 12px",
                fontSize: 12,
                fontWeight: 500,
                color: CHROME.text,
                background: "transparent",
                border: `1px solid ${CHROME.line}`,
                borderRadius: 6,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={busy}
              className="cursor-pointer transition disabled:cursor-not-allowed disabled:opacity-60"
              style={{
                padding: "7px 14px",
                fontSize: 12,
                fontWeight: 600,
                color: "#fff",
                background: CHROME.ink,
                border: `1px solid ${CHROME.ink}`,
                borderRadius: 6,
                letterSpacing: "-0.005em",
              }}
            >
              {busy ? "Generating…" : "Generate link"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ExitButton() {
  const { pending } = useFormStatus();
  return (
    <TbTextBtn disabled={pending}>
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
      <PagePicker title={pageTitle ?? "Homepage"} />
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

      {/* ── Spacer ── */}
      <span className="flex-1" />

      {/* ── Right icon cluster ── */}
      <TbIconBtn title="Page settings" onClick={onPageSettings}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </TbIconBtn>
      <TbIconBtn title="Revisions" onClick={onRevisions}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
          <path d="M3 3v5h5" />
          <path d="M12 7v5l3 2" />
        </svg>
      </TbIconBtn>
      <TbIconBtn title="Theme" onClick={onTheme}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 22a10 10 0 1 1 10-10c0 2.5-2 4-4 4h-2a2 2 0 0 0-2 2 2 2 0 0 1-2 2z" />
          <circle cx="6.5" cy="12.5" r="1" fill="currentColor" />
          <circle cx="9.5" cy="7.5" r="1" fill="currentColor" />
          <circle cx="14.5" cy="7.5" r="1" fill="currentColor" />
          <circle cx="17.5" cy="12.5" r="1" fill="currentColor" />
        </svg>
      </TbIconBtn>
      <TbIconBtn
        title="Comments"
        onClick={onComments}
        badge={commentsBadge}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </TbIconBtn>
      <TbIconBtn title="Assets library (⌘L)" onClick={onAssets}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        </svg>
      </TbIconBtn>
      <TbIconBtn title="Preview as visitor (⌘P)" onClick={handlePreview}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </TbIconBtn>
      <ShareIconWithPopover onShare={onShare} />

      <TbDivider />

      {/* ── Save draft · Publish split ── */}
      <TbTextBtn
        title="Save a draft checkpoint"
        disabled={saving || !onSaveDraft}
        onClick={onSaveDraft ? () => void onSaveDraft() : undefined}
      >
        Save draft
      </TbTextBtn>
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
