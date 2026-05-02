"use client";

/**
 * Tulala admin-shell prototype primitives.
 *
 * ─── data-tulala-* selector convention (WS-0.11) ─────────────────────
 *
 * Every interactive container in this prototype carries a stable
 * `data-tulala-<name>` attribute so QA / e2e tests / future preview
 * tools can target it without depending on classnames or DOM shape.
 *
 * Naming rules:
 *   - lowercase, dash-separated, prefix is always `data-tulala-`
 *   - the suffix names the THING, not the variant: `data-tulala-card`
 *     not `data-tulala-primary-card`
 *   - variant goes in the value: `data-tulala-card="primary"`
 *   - one attribute per element; if you need multiple, create a
 *     compound id (`data-tulala-drawer-help-panel`, not two attrs)
 *
 * Existing reserved names — DO NOT reuse for new components:
 *   data-tulala-drawer-panel        — drawer outer aside
 *   data-tulala-drawer-overlay      — drawer backdrop
 *   data-tulala-drawer-body         — drawer scrollable body
 *   data-tulala-drawer-footer       — drawer footer
 *   data-tulala-drawer-size-toolbar — compact/half/full size group
 *   data-tulala-drawer-help-panel   — slide-down help region
 *   data-tulala-help-btn            — drawer toolbar ⓘ button
 *   data-tulala-help-dot            — "unread help" pulse indicator
 *   data-tulala-mobile-bottom-nav   — fixed mobile bottom navigation
 *   data-tulala-page-back           — page-level back button
 *   data-tulala-card                — card primitive (variant in value)
 *   data-tulala-empty-state         — empty-state primitive
 *   data-tulala-skeleton            — skeleton shimmer
 *   data-tulala-confirm-dialog      — confirmation dialog modal
 *   data-tulala-identity-bar        — top-of-page identity bar
 *   data-tulala-modal-popover       — ModalPopover overlay (WS-4)
 *   data-tulala-modal-popover-body  — ModalPopover scrollable body (WS-4)
 *   data-tulala-stale-pill          — stale-data refresh pill (WS-6.6)
 *   data-tulala-conflict-dialog     — conflict-resolution dialog (WS-6.8)
 *   data-tulala-guided-tour         — GuidedTour spotlight (WS-9.7)
 *
 * When adding a new interactive container, add the attribute AND
 * append it to this list. Never silently rename — downstream tests
 * may depend on the existing name.
 *
 * See ROADMAP.md §7.2 for the full engineer convention list.
 */

import {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  CLIENT_TRUST_META,
  COLORS,
  ENTITY_TYPE_META,
  FONTS,
  RADIUS,
  TRANSITION,
  Z,
  useProto,
  PAYMENT_STATUS_META,
  PAYOUT_STATUS_META,
  PLAN_META,
  planPriceCompact,
  REPRESENTATION_META,
  ROLE_META,
  TALENT_STATE_TONE,
  type BookingPaymentStatus,
  type ClientTrustLevel,
  type EntityType,
  type PayoutConnectionStatus,
  type Plan,
  type RepresentationStatus,
  type Role,
  type TalentProfile,
} from "./_state";
import {
  HelpPanel,
  hasHelp,
  hasOpenedHelp,
  markHelpOpened,
} from "./_help";

// ─── Scroll-lock counter ─────────────────────────────────────────────
// Tracks how many overlays (drawers + modals) are open so we only
// release body scroll when ALL of them have closed. Prevents the bug
// where closing drawer A releases scroll even though modal B is still open.
//
// The depth tracker is reconciled against an actual DOM probe: each
// unlock checks whether ANY overlay is still rendered before clearing
// `body.style.overflow`. This makes scroll-lock self-healing across:
//   - HMR cycles that lose effect cleanups
//   - Unmount races where cleanup runs after the next mount
//   - Stale provider-tree teardowns during navigation
// If overlays aren't actually rendered, scroll is restored regardless
// of what the counter thinks.
let _overlayDepth = 0;
const OVERLAY_QUERY = '[data-tulala-drawer-panel],[data-tulala-modal-overlay],[data-tulala-confirm-dialog]';
function reconcileScrollLock() {
  if (typeof document === "undefined") return;
  const stillOpen = document.querySelectorAll(OVERLAY_QUERY).length > 0;
  if (!stillOpen) {
    _overlayDepth = 0;
    document.body.style.overflow = "";
  }
}
function lockScroll() {
  _overlayDepth++;
  if (typeof document !== "undefined") document.body.style.overflow = "hidden";
}
function unlockScroll() {
  _overlayDepth = Math.max(0, _overlayDepth - 1);
  if (_overlayDepth === 0 && typeof document !== "undefined") {
    document.body.style.overflow = "";
  }
  // Defer one frame so the closing overlay's unmount has propagated to
  // the DOM, then reconcile. Catches the HMR-leak case where the
  // counter is wrong but no overlays are actually visible.
  if (typeof requestAnimationFrame !== "undefined") {
    requestAnimationFrame(reconcileScrollLock);
  }
}

// ─── Inline icons (kept tiny + neutral) ──────────────────────────────

export function Icon({
  name,
  size = 14,
  stroke = 1.6,
  color = "currentColor",
}: {
  name:
    | "arrow-right"
    | "chevron-right"
    | "chevron-down"
    | "x"
    | "lock"
    | "check"
    | "plus"
    | "sparkle"
    | "external"
    | "search"
    | "filter"
    | "info"
    | "user"
    | "team"
    | "globe"
    | "palette"
    | "credit"
    | "settings"
    | "calendar"
    | "mail"
    | "bolt"
    | "circle"
    | "alert"
    | "star"
    | "bell"
    | "moon"
    | "map-pin"
    | "archive"
    | "pencil";
  size?: number;
  stroke?: number;
  color?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: color,
    strokeWidth: stroke,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "arrow-right":
      return (
        <svg {...common}>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      );
    case "chevron-right":
      return (
        <svg {...common}>
          <path d="M9 6l6 6-6 6" />
        </svg>
      );
    case "chevron-down":
      return (
        <svg {...common}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      );
    case "x":
      return (
        <svg {...common}>
          <path d="M6 6l12 12M18 6l-12 12" />
        </svg>
      );
    case "lock":
      return (
        <svg {...common}>
          <rect x="5" y="11" width="14" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 1 1 8 0v3" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="M5 12l5 5 9-11" />
        </svg>
      );
    case "plus":
      return (
        <svg {...common}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "sparkle":
      return (
        <svg {...common}>
          <path d="M12 3v6M12 15v6M3 12h6M15 12h6" />
        </svg>
      );
    case "external":
      return (
        <svg {...common}>
          <path d="M14 4h6v6M20 4l-9 9M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" />
        </svg>
      );
    case "search":
      return (
        <svg {...common}>
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-4-4" />
        </svg>
      );
    case "filter":
      return (
        <svg {...common}>
          <path d="M4 5h16M7 12h10M10 19h4" />
        </svg>
      );
    case "info":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v.01M12 12v4" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="9" r="4" />
          <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
        </svg>
      );
    case "team":
      return (
        <svg {...common}>
          <circle cx="9" cy="9" r="3.5" />
          <circle cx="17" cy="10" r="2.5" />
          <path d="M3 19c1-3 3.5-4.5 6-4.5s5 1.5 6 4.5" />
          <path d="M15 19c0.6-2 2-3 3.5-3" />
        </svg>
      );
    case "globe":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
        </svg>
      );
    case "palette":
      return (
        <svg {...common}>
          <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 2-2 0-1-0.5-1.5 0-2 0.5-0.5 1.5-0.5 2.5-0.5h1A3.5 3.5 0 0 0 21 13c0-5-4-10-9-10z" />
          <circle cx="7.5" cy="11" r="1" fill={color} stroke="none" />
          <circle cx="10" cy="7.5" r="1" fill={color} stroke="none" />
          <circle cx="15" cy="7.5" r="1" fill={color} stroke="none" />
        </svg>
      );
    case "credit":
      return (
        <svg {...common}>
          <rect x="3" y="6" width="18" height="13" rx="2" />
          <path d="M3 10h18M7 15h3" />
        </svg>
      );
    case "settings":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5l1.5-1.5M17 7l1.5-1.5" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "mail":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 7 9-7" />
        </svg>
      );
    case "bolt":
      return (
        <svg {...common}>
          <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
        </svg>
      );
    case "circle":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case "map-pin":
      return (
        <svg {...common}>
          <path d="M12 22s7-7.58 7-12a7 7 0 1 0-14 0c0 4.42 7 12 7 12z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M12 3l10 17H2L12 3z" />
          <path d="M12 10v4M12 17v.01" />
        </svg>
      );
    case "star":
      return (
        <svg {...common}>
          <path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.9L12 16.5 6.8 19.2l1-5.9L3.5 9.2l5.9-.9L12 3z" />
        </svg>
      );
    case "bell":
      return (
        <svg {...common}>
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10 21a2 2 0 0 0 4 0" />
        </svg>
      );
    case "moon":
      return (
        <svg {...common}>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      );
    case "archive":
      return (
        <svg {...common}>
          <path d="M3 6h18M5 6v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6M9 11h6" />
          <rect x="3" y="3" width="18" height="4" rx="1" />
        </svg>
      );
    case "pencil":
      return (
        <svg {...common}>
          <path d="M16 3l5 5L8 21H3v-5L16 3z" />
        </svg>
      );
  }
}

// ─── WS-0 Foundation: hooks ──────────────────────────────────────────
//
// Per ROADMAP §4 WS-0, these are the primitives that all other
// workstreams depend on. Keep them small, well-typed, SSR-safe.

/**
 * WS-0.1 — Viewport classification hook.
 *
 * Returns one of `phone | tablet | desktop | wide`. Breakpoints:
 *   phone   < 768
 *   tablet  768–1023
 *   desktop 1024–1279
 *   wide    ≥ 1280
 *
 * SSR-safe: returns `"desktop"` server-side / pre-mount, so HTML
 * markup is stable. Client-side then refines on the first paint and
 * tracks resizes thereafter (debounced 80ms — fast enough to feel
 * instant, slow enough to skip resize-storm renders).
 *
 * Implementation note: uses `matchMedia` listeners rather than a
 * resize event so we react only when the actual breakpoint changes
 * rather than every pixel. Same hook used by DrawerShell, message
 * stream, calendar, and bottom-nav.
 */
export type Viewport = "phone" | "tablet" | "desktop" | "wide";

const VIEWPORT_QUERIES: Array<{ query: string; viewport: Viewport }> = [
  { query: "(min-width: 1280px)", viewport: "wide" },
  { query: "(min-width: 1024px)", viewport: "desktop" },
  { query: "(min-width: 768px)", viewport: "tablet" },
  { query: "(max-width: 767.98px)", viewport: "phone" },
];

function classifyViewport(): Viewport {
  if (typeof window === "undefined" || !window.matchMedia) return "desktop";
  for (const { query, viewport } of VIEWPORT_QUERIES) {
    if (window.matchMedia(query).matches) return viewport;
  }
  return "desktop";
}

export function useViewport(): Viewport {
  // useState lazy initializer reads matchMedia on first client render.
  // Returns "desktop" during SSR — see file header comment.
  const [vp, setVp] = useState<Viewport>(() => classifyViewport());
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    let timer: number | null = null;
    const onChange = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        setVp(classifyViewport());
        timer = null;
      }, 80);
    };
    // Listen on every breakpoint query — any of them flipping
    // means we need to re-classify.
    const mqls = VIEWPORT_QUERIES.map(({ query }) => window.matchMedia(query));
    mqls.forEach((mql) => mql.addEventListener("change", onChange));
    // Reconcile once on mount in case state was stale.
    onChange();
    return () => {
      if (timer !== null) window.clearTimeout(timer);
      mqls.forEach((mql) => mql.removeEventListener("change", onChange));
    };
  }, []);
  return vp;
}

/** Convenience helper: is the viewport at least the given size? */
export function viewportAtLeast(current: Viewport, min: Viewport): boolean {
  const order: Record<Viewport, number> = { phone: 0, tablet: 1, desktop: 2, wide: 3 };
  return order[current] >= order[min];
}

/**
 * WS-0.4 — Feature flag hook.
 *
 * Reads from URL `?flag=foo,bar,baz` plus a localStorage override at
 * key `tulala-feature-flags-v1` (comma-separated). Either source
 * activates the flag. Used to gate WS-1 chat redesign behind
 * `?flag=messages-v2` etc.
 *
 * SSR-safe: returns false until mounted on the client.
 */
const FEATURE_FLAG_STORAGE_KEY = "tulala-feature-flags-v1";

function readFlagSet(): Set<string> {
  if (typeof window === "undefined") return new Set();
  const set = new Set<string>();
  try {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("flag");
    if (fromUrl) fromUrl.split(",").map((s) => s.trim()).filter(Boolean).forEach((k) => set.add(k));
  } catch {}
  try {
    const raw = window.localStorage.getItem(FEATURE_FLAG_STORAGE_KEY);
    if (raw) raw.split(",").map((s) => s.trim()).filter(Boolean).forEach((k) => set.add(k));
  } catch {}
  return set;
}

export function useFeatureFlag(key: string): boolean {
  const [active, setActive] = useState(false);
  useEffect(() => {
    setActive(readFlagSet().has(key));
    const onStorage = () => setActive(readFlagSet().has(key));
    if (typeof window !== "undefined") {
      window.addEventListener("storage", onStorage);
      return () => window.removeEventListener("storage", onStorage);
    }
  }, [key]);
  return active;
}

/** Dev/QA helper to flip a flag from the console. Not for prod use. */
export function setFeatureFlag(key: string, on: boolean): void {
  if (typeof window === "undefined") return;
  const set = readFlagSet();
  if (on) set.add(key);
  else set.delete(key);
  try {
    window.localStorage.setItem(FEATURE_FLAG_STORAGE_KEY, [...set].join(","));
    // Notify other tabs + this tab's listeners.
    window.dispatchEvent(new StorageEvent("storage", { key: FEATURE_FLAG_STORAGE_KEY }));
  } catch {}
}

// ─── WS-0.6 Typography primitives ────────────────────────────────────
//
// Single source of truth for headings + meta text. Replaces the
// scattered inline-style `fontSize: 22, fontWeight: 500` instances
// across pages/drawers. Migration is gradual (WS-16.x sweep) but new
// surfaces use these from day 1.

type TypographyProps = {
  children: ReactNode;
  /** Override color from semantic COLORS — defaults to ink. */
  color?: string;
  /** Pass through className for Tailwind users (we use inline-style here). */
  className?: string;
  /** Tighten line-height for dense layouts. */
  tight?: boolean;
  style?: CSSProperties;
};

export function H1({ children, color = COLORS.ink, tight, style }: TypographyProps) {
  return (
    <h1
      style={{
        fontFamily: FONTS.display,
        fontSize: 28,
        fontWeight: 500,
        letterSpacing: -0.4,
        color,
        margin: 0,
        lineHeight: tight ? 1.1 : 1.2,
        ...style,
      }}
    >
      {children}
    </h1>
  );
}

export function H2({ children, color = COLORS.ink, tight, style }: TypographyProps) {
  return (
    <h2
      style={{
        fontFamily: FONTS.display,
        fontSize: 22,
        fontWeight: 500,
        letterSpacing: -0.3,
        color,
        margin: 0,
        lineHeight: tight ? 1.15 : 1.25,
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

export function H3({ children, color = COLORS.ink, tight, style }: TypographyProps) {
  return (
    <h3
      style={{
        fontFamily: FONTS.display,
        fontSize: 17,
        fontWeight: 500,
        letterSpacing: -0.15,
        color,
        margin: 0,
        lineHeight: tight ? 1.2 : 1.35,
        ...style,
      }}
    >
      {children}
    </h3>
  );
}

/** Small uppercase eyebrow above a heading. Sentence case kept lowercase
 * — content code uppercases via `text-transform`. */
export function Eyebrow({ children, color = COLORS.inkMuted, style }: TypographyProps) {
  return (
    <span
      style={{
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Subordinate caption / meta line under a heading. */
export function Caption({ children, color = COLORS.inkMuted, style }: TypographyProps) {
  return (
    <p
      style={{
        fontFamily: FONTS.body,
        fontSize: 13,
        fontWeight: 400,
        color,
        margin: 0,
        lineHeight: 1.5,
        ...style,
      }}
    >
      {children}
    </p>
  );
}

// ─── WS-0.2 Card primitive ───────────────────────────────────────────
//
// Three archetypes locked down. Replaces ad-hoc card-shaped divs.
// Distinct from the older PrimaryCard/SecondaryCard/StatusCard set
// further down in this file (which has its own `CardVariant` type
// with a different value space). WS-16 polish will consolidate.
//
//   primary — white surface, thin border, gentle shadow on hover
//   info    — soft brand-tinted surface; for infosheets / callouts
//   quiet   — borderless, transparent — sits inside another surface

export type CardKind = "primary" | "info" | "quiet";

const CARD_STYLES: Record<CardKind, CSSProperties> = {
  primary: {
    background: "#fff",
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: RADIUS.lg,
    boxShadow: COLORS.shadow,
    padding: 18,
    transition: `border-color ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
  },
  info: {
    background: COLORS.brandSoft,
    border: `1px solid ${COLORS.brand}1a`,
    borderRadius: RADIUS.lg,
    padding: 16,
  },
  quiet: {
    background: "transparent",
    border: "none",
    borderRadius: RADIUS.md,
    padding: 12,
  },
};

export function Card({
  children,
  variant = "primary",
  interactive,
  onClick,
  style,
  dataAttr,
}: {
  children: ReactNode;
  variant?: CardKind;
  /** Adds hover affordance (cursor pointer + lift on hover). */
  interactive?: boolean;
  onClick?: () => void;
  style?: CSSProperties;
  /** QA selector — written to `data-tulala-card`. */
  dataAttr?: string;
}) {
  const base = CARD_STYLES[variant];
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      data-tulala-card={dataAttr ?? variant}
      style={{
        ...base,
        cursor: interactive || onClick ? "pointer" : undefined,
        ...style,
      }}
      onMouseEnter={
        interactive && variant === "primary"
          ? (e) => {
              e.currentTarget.style.borderColor = COLORS.border;
              e.currentTarget.style.boxShadow = COLORS.shadowHover;
            }
          : undefined
      }
      onMouseLeave={
        interactive && variant === "primary"
          ? (e) => {
              e.currentTarget.style.borderColor = COLORS.borderSoft;
              e.currentTarget.style.boxShadow = COLORS.shadow;
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

// WS-0.3 EmptyState — already exists later in this file. Existing
// shape (typed icon names + optional primary/secondary CTAs + tips)
// is richer than what WS-0.3 specced; consolidation deferred to WS-16.

// WS-0.7 Skeleton — already exists later in this file. Existing
// shape is single-shape only; the multi-shape variant (text / circle
// / block / row) called for in WS-0.7 is deferred to WS-16 polish so
// we don't break existing call sites.

// ─── WS-0.8 ConfirmDialog primitive ──────────────────────────────────
//
// Unified destructive-action confirmation. Used by: workspace delete,
// account merge, contract void, refund, etc. With optional "type the
// name to confirm" guard for high-stakes operations.

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive,
  typeNameToConfirm,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles confirm button as critical. */
  destructive?: boolean;
  /** If set, user must type this string before Confirm enables.
   *  E.g. workspace name for the danger-zone delete flow. */
  typeNameToConfirm?: string;
}) {
  const [typed, setTyped] = useState("");
  const canConfirm = !typeNameToConfirm || typed === typeNameToConfirm;

  useEffect(() => {
    if (!open) {
      setTyped("");
      return;
    }
    lockScroll();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Enter" && canConfirm) onConfirm();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [open, canConfirm, onClose, onConfirm]);

  if (!open) return null;

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.32)",
          zIndex: Z.modalBackdrop,
        }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tulala-confirm-title"
        data-tulala-confirm-dialog
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: "min(440px, 92vw)",
          background: "#fff",
          borderRadius: RADIUS.lg,
          boxShadow: "0 30px 60px -20px rgba(11,11,13,0.45)",
          padding: "22px 22px 18px",
          zIndex: Z.modalPanel,
          fontFamily: FONTS.body,
        }}
      >
        <H3 style={{ marginBottom: 8 }}>
          <span id="tulala-confirm-title">{title}</span>
        </H3>
        <div style={{ fontSize: 14, color: COLORS.inkMuted, lineHeight: 1.5, marginBottom: 14 }}>
          {body}
        </div>
        {typeNameToConfirm && (
          <div style={{ marginBottom: 14 }}>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: COLORS.inkMuted,
                marginBottom: 6,
              }}
            >
              Type{" "}
              <strong style={{ color: COLORS.ink, fontWeight: 600 }}>
                {typeNameToConfirm}
              </strong>{" "}
              to confirm:
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoFocus
              style={{
                width: "100%",
                padding: "8px 10px",
                fontSize: 14,
                borderRadius: RADIUS.md,
                border: `1px solid ${COLORS.border}`,
                background: "#fff",
                color: COLORS.ink,
                fontFamily: FONTS.body,
                outline: "none",
              }}
            />
          </div>
        )}
        <div
          style={{
            display: "flex",
            gap: 8,
            justifyContent: "flex-end",
            marginTop: 8,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "8px 14px",
              borderRadius: RADIUS.md,
              border: `1px solid ${COLORS.borderSoft}`,
              background: "#fff",
              color: COLORS.inkMuted,
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!canConfirm}
            style={{
              padding: "8px 14px",
              borderRadius: RADIUS.md,
              border: "none",
              background: destructive
                ? canConfirm ? COLORS.critical : COLORS.criticalSoft
                : canConfirm ? COLORS.brand : COLORS.brandSoft,
              color: canConfirm ? "#fff" : COLORS.inkMuted,
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              cursor: canConfirm ? "pointer" : "not-allowed",
              transition: `background ${TRANSITION.micro}`,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

// ─── Atoms ───────────────────────────────────────────────────────────

export function CapsLabel({
  children,
  color,
  style,
  case: caseStyle = "upper",
}: {
  children: ReactNode;
  color?: string;
  style?: CSSProperties;
  /**
   * "upper" (default) gives the historical loud-eyebrow look. "sentence"
   * keeps the same size/weight/color but drops the uppercase + tight
   * letter-spacing — feels less like a system notification.
   */
  case?: "upper" | "sentence";
}) {
  return (
    <span
      style={{
        fontFamily: FONTS.body,
        fontSize: caseStyle === "sentence" ? 12 : 10.5,
        fontWeight: caseStyle === "sentence" ? 500 : 600,
        letterSpacing: caseStyle === "sentence" ? 0.05 : 1.4,
        textTransform: caseStyle === "sentence" ? "none" : "uppercase",
        color: color ?? COLORS.inkMuted,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function Bullet() {
  return (
    <span
      style={{ color: COLORS.inkDim, fontSize: 12, padding: "0 6px" }}
      aria-hidden
    >
      ·
    </span>
  );
}

export function StatDot({
  tone = "ink",
  size = 6,
}: {
  tone?: "ink" | "amber" | "green" | "dim" | "red";
  size?: number;
}) {
  const palette: Record<string, string> = {
    ink: COLORS.ink,
    amber: COLORS.amber,
    green: COLORS.green,
    dim: COLORS.inkDim,
    red: COLORS.red,
  };
  return (
    <span
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        background: palette[tone],
      }}
      aria-hidden
    />
  );
}

/**
 * StatusPill — the canonical "tone + label" badge.
 *
 * Replaces four ad-hoc variants that diverged across pages and drawers:
 *   StatusBadge / StageBadge (full-size, with dot)
 *   StateChipMini / StageBadgeMini (compact, no dot)
 *
 * Single primitive, two sizes. Stage-specific wrappers (StageBadge) layer
 * on top to translate stage → label + tone.
 */
export type StatusPillTone = "ink" | "amber" | "green" | "dim" | "red";

export function StatusPill({
  tone,
  label,
  size = "md",
  withDot,
  capitalize,
}: {
  tone: StatusPillTone;
  label: string;
  size?: "sm" | "md";
  /** Defaults: md → true, sm → false. Override explicitly to force. */
  withDot?: boolean;
  /** Capitalize the label client-side (handy for raw status strings). */
  capitalize?: boolean;
}) {
  const palette: Record<StatusPillTone, { bg: string; fg: string }> = {
    green: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42" },
    amber: { bg: "rgba(82,96,109,0.10)", fg: "#3A4651" },
    red: { bg: "rgba(176,48,58,0.10)", fg: "#7A1F26" },
    ink: { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink },
    dim: { bg: "rgba(11,11,13,0.05)", fg: COLORS.inkMuted },
  };
  const c = palette[tone];
  const showDot = withDot ?? size === "md";
  const padding = size === "md" ? "3px 8px" : "2px 7px";
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: showDot ? 5 : 0,
        background: c.bg,
        color: c.fg,
        padding,
        borderRadius: 999,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 500,
        textTransform: capitalize ? "capitalize" : undefined,
        whiteSpace: "nowrap",
      }}
    >
      {showDot && <StatDot tone={tone} size={5} />}
      {label}
    </span>
  );
}

export function PlanChip({
  plan,
  variant = "soft",
}: {
  plan: Plan;
  variant?: "soft" | "outline" | "solid";
}) {
  const meta = PLAN_META[plan];
  const styles: Record<typeof variant, CSSProperties> = {
    soft: {
      background: plan === "free" ? "rgba(11,11,13,0.05)" : "rgba(11,11,13,0.06)",
      color: COLORS.ink,
      border: "1px solid transparent",
    },
    outline: {
      background: "transparent",
      color: COLORS.inkMuted,
      border: `1px solid ${COLORS.border}`,
    },
    solid: {
      background: COLORS.fill,
      color: "#fff",
      border: "1px solid transparent",
    },
  };
  return (
    <span
      style={{
        ...styles[variant],
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        padding: "3px 8px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

export function RoleChip({ role }: { role: Role }) {
  return (
    <span
      style={{
        background: "rgba(11,11,13,0.05)",
        color: COLORS.ink,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.3,
        padding: "3px 8px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {ROLE_META[role].label}
    </span>
  );
}

/**
 * Subtle indicator of entity model. Sits next to PlanChip in the workspace
 * topbar and gets a slim icon + outline style so it never competes with plan.
 * Hubs get a network glyph (·•·) — not gold, not orange. Agencies get a
 * small mark (▣). Both stay monochrome to honour the calm aesthetic.
 */
export function EntityChip({
  entityType,
  variant = "outline",
}: {
  entityType: EntityType;
  variant?: "outline" | "soft";
}) {
  const meta = ENTITY_TYPE_META[entityType];
  // Solid 5px dot replaces the previous unicode glyph (▣ / ·•·). The glyph
  // rendered as a faint × at small sizes — confusing because it sat next
  // to a plan chip and read like a "remove" affordance.
  const styles: CSSProperties =
    variant === "soft"
      ? {
          background: "rgba(11,11,13,0.05)",
          color: COLORS.ink,
          border: "1px solid transparent",
        }
      : {
          background: "transparent",
          color: COLORS.inkMuted,
          border: `1px solid ${COLORS.border}`,
        };
  return (
    <span
      title={meta.tagline}
      style={{
        ...styles,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        padding: "3px 8px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        whiteSpace: "nowrap",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: COLORS.inkMuted,
          opacity: 0.55,
          flexShrink: 0,
        }}
      />
      {meta.label}
    </span>
  );
}

/**
 * Payout-connection chip — surfaces "Bank connected" / "Pending" / "Not
 * connected" / "Action needed" so the receiver-eligibility model is
 * visible everywhere a person could be selected as the payout target.
 */
export function PayoutStatusChip({
  status,
  variant = "soft",
}: {
  status: PayoutConnectionStatus;
  variant?: "soft" | "outline";
}) {
  const meta = PAYOUT_STATUS_META[status];
  const palette: Record<typeof meta.tone, { bg: string; fg: string; dot: string }> = {
    green: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42", dot: COLORS.green },
    amber: { bg: "rgba(82,96,109,0.12)", fg: "#3A4651", dot: COLORS.amber },
    dim: { bg: "rgba(11,11,13,0.04)", fg: COLORS.inkMuted, dot: COLORS.inkDim },
    red: { bg: "rgba(176,48,58,0.10)", fg: "#7A2026", dot: COLORS.red },
  };
  const c = palette[meta.tone];
  const styles: CSSProperties =
    variant === "outline"
      ? {
          background: "transparent",
          color: c.fg,
          border: `1px solid ${c.fg}33`,
        }
      : {
          background: c.bg,
          color: c.fg,
          border: "1px solid transparent",
        };
  return (
    <span
      title={meta.hint}
      style={{
        ...styles,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 600,
        letterSpacing: 0.3,
        padding: "3px 8px 3px 7px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: c.dot,
        }}
      />
      {meta.label}
    </span>
  );
}

/**
 * Booking-level payment lifecycle chip — drives the status pill on the
 * booking detail and the workspace billing/payments table.
 */
export function PaymentStatusChip({
  status,
  compact,
}: {
  status: BookingPaymentStatus;
  compact?: boolean;
}) {
  const meta = PAYMENT_STATUS_META[status];
  const palette: Record<typeof meta.tone, { bg: string; fg: string }> = {
    ink: { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink },
    amber: { bg: "rgba(82,96,109,0.12)", fg: "#3A4651" },
    green: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42" },
    dim: { bg: "rgba(11,11,13,0.04)", fg: COLORS.inkMuted },
    red: { bg: "rgba(176,48,58,0.10)", fg: "#7A2026" },
  };
  const c = palette[meta.tone];
  return (
    <span
      title={meta.description}
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: c.bg,
        color: c.fg,
        fontFamily: FONTS.body,
        fontSize: compact ? 10 : 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        padding: compact ? "2px 7px" : "3px 9px",
        borderRadius: 999,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

/**
 * RepresentationChip — small pill that says how a talent is represented:
 * `Exclusive`, `Non-exclusive`, or `Freelance`. Hover gives the full
 * agency name(s). Used on talent profile drawers, agency-side talent
 * lists, and inquiry-ownership rationale lines.
 */
export function RepresentationChip({
  representation,
  compact,
}: {
  representation: RepresentationStatus;
  compact?: boolean;
}) {
  const meta = REPRESENTATION_META[representation.kind];
  const palette: Record<typeof meta.tone, { bg: string; fg: string }> = {
    ink: { bg: "rgba(11,11,13,0.06)", fg: COLORS.ink },
    amber: { bg: "rgba(82,96,109,0.12)", fg: "#3A4651" },
    green: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42" },
    dim: { bg: "rgba(11,11,13,0.04)", fg: COLORS.inkMuted },
  };
  const c = palette[meta.tone];
  const detail =
    representation.kind === "exclusive"
      ? ` · ${representation.agencyName}`
      : representation.kind === "non-exclusive"
        ? ` · ${representation.agencyNames.join(", ")}`
        : "";
  return (
    <span
      title={meta.hint + detail}
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: c.bg,
        color: c.fg,
        fontFamily: FONTS.body,
        fontSize: compact ? 10 : 10.5,
        fontWeight: 600,
        letterSpacing: 0.4,
        padding: compact ? "2px 7px" : "3px 9px",
        borderRadius: 999,
        textTransform: "uppercase",
        whiteSpace: "nowrap",
      }}
    >
      {meta.short}
    </span>
  );
}

/**
 * ClientTrustChip — compact pill that signals the client's trust tier
 * (Basic / Verified / Silver / Gold). Driven by real verification +
 * funded-account events on the client identity. NEVER framed as
 * "pay to message" — see project_client_trust_badges.md §2.
 *
 * Visual register is intentionally muted: silver = brushed-metal cool,
 * gold = aged-brass warm. No glow, no sparkle.
 *
 * Surfaces:
 *  - Talent inbox / today-pulse cards (compact)
 *  - InquiryWorkspaceDrawer header strip (compact)
 *  - Client profile drawer (standard)
 *  - Talent contact-preferences drawer legend (standard)
 *
 * Hidden on:
 *  - Public roster pages or any client-facing list (clients don't see
 *    other clients' tiers)
 *  - Booking detail / contracts (past the trust gate by then)
 */
export function ClientTrustChip({
  level,
  compact,
  withDot = true,
}: {
  level: ClientTrustLevel;
  compact?: boolean;
  /** Tiny tier dot. Useful in tight rows; can be hidden in legends. */
  withDot?: boolean;
}) {
  const meta = CLIENT_TRUST_META[level];
  const palette: Record<typeof meta.tone, { bg: string; fg: string; dot: string; border: string }> = {
    // Basic — neutral / dim. Says "default", not "bad". Foreground bumped
    // darker to clear WCAG AA contrast on white at 12.5px.
    dim: {
      bg: "rgba(11,11,13,0.06)",
      fg: "#4A4A52",
      dot: "#7A7A80",
      border: "transparent",
    },
    // Verified — quiet teal-blue. Differentiates from "Basic" (which is
    // also dim ink) so the badge actually signals "this client checked
    // out". Cool tone keeps it grown-up; not a green "success" badge.
    ink: {
      bg: "rgba(60,90,108,0.10)",
      fg: "#3F5C70",
      dot: "#5B7A8E",
      border: "transparent",
    },
    // Silver — cool muted. Brushed-metal subtle.
    silver: {
      bg: "rgba(110,118,134,0.10)",
      fg: "#3F4756",
      dot: "#7F8896",
      border: "transparent",
    },
    // Gold — deep-forest accent. Reads as "trusted / verified ascendant."
    // Not warm, not bling. Pairs cleanly with the Silver brushed-metal cool.
    gold: {
      bg: "rgba(15,79,62,0.10)",
      fg: "#0F4F3E",
      dot: "#1F7B5C",
      border: "transparent",
    },
  };
  const c = palette[meta.tone];
  return (
    <Popover content={`${meta.label} client — ${meta.hint}`}>
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: withDot ? 5 : 0,
          background: c.bg,
          color: c.fg,
          border: c.border === "transparent" ? "none" : `1px solid ${c.border}`,
          fontFamily: FONTS.body,
          // Sentence-case + tighter tracking — was uppercase + wide
          // tracking, which read like a system status notification
          // every time it appeared in a row.
          fontSize: compact ? 10.5 : 11,
          fontWeight: 600,
          letterSpacing: 0.05,
          padding: compact ? "2px 7px" : "3px 9px",
          borderRadius: 999,
          textTransform: "none",
          whiteSpace: "nowrap",
        }}
      >
      {withDot ? (
        <span
          style={{
            display: "inline-block",
            width: 5,
            height: 5,
            borderRadius: 999,
            background: c.dot,
          }}
        />
      ) : null}
      {meta.short}
      </span>
    </Popover>
  );
}

/**
 * ClientTrustBadge — compact icon-only overlay for placement on the
 * bottom-right corner of a client avatar. Hides for `basic` (basic =
 * default, no badge needs to render). Hover/click reveals the same
 * Popover tooltip that ClientTrustChip uses.
 *
 * Use when:
 *  - The trust signal needs to ride along with brand identity (avatars
 *    in row lists) without consuming additional row space.
 *
 * Anatomy:
 *  - 16×16 circle, 2px white border (so it lifts off the avatar)
 *  - Tier-tinted background, tier icon inside
 *  - Positioned absolute — caller wraps Avatar in `position: relative`
 *
 * Iconography per tier:
 *  - verified  → check        (identity confirmed)
 *  - silver    → sparkle      (funded, established)
 *  - gold      → sparkle      (highest trust, deeper color)
 */
export function ClientTrustBadge({
  level,
  size = 16,
}: {
  level: ClientTrustLevel;
  size?: number;
}) {
  if (level === "basic") return null;
  const meta = CLIENT_TRUST_META[level];
  const palette: Record<Exclude<ClientTrustLevel, "basic">, { bg: string; fg: string }> = {
    verified: { bg: "#3F5C70", fg: "#fff" },
    silver: { bg: "#7F8896", fg: "#fff" },
    gold: { bg: COLORS.accent, fg: "#fff" },
  };
  const c = palette[level];
  const iconName = level === "verified" ? "check" : "sparkle";
  return (
    <Popover content={`${meta.label} client — ${meta.hint}`}>
      <span
        aria-label={`${meta.label} client`}
        style={{
          position: "absolute",
          right: -2,
          bottom: -2,
          width: size,
          height: size,
          borderRadius: "50%",
          background: c.bg,
          color: c.fg,
          border: `2px solid #fff`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 1px 2px rgba(11,11,13,0.10)",
          cursor: "default",
        }}
      >
        <Icon name={iconName} size={Math.round(size * 0.55)} stroke={2.4} color={c.fg} />
      </span>
    </Popover>
  );
}

/**
 * Inline upsell banner for the client surface — surfaces "Get Verified"
 * (or the appropriate next-tier explainer) on the client dashboard.
 *
 * At Basic → renders an actionable banner with price + lead-time + CTA.
 * At Verified/Silver → renders a soft "what unlocks the next tier" note.
 * At Gold → returns null (nothing to upsell).
 *
 * Per project_client_trust_badges.md the framing is "better access
 * opportunities", never "pay to DM". Copy stays on the access side.
 */
export function TrustBoostBanner({
  level,
  onUpgrade,
}: {
  level: ClientTrustLevel;
  onUpgrade?: () => void;
}) {
  // Inline reference instead of importing TRUST_TIER_UPGRADE here to keep
  // the primitives file framework-light. Caller passes the next-tier copy
  // via the wrapper.
  if (level === "gold") return null;

  const isActionable = level === "basic";
  const meta = CLIENT_TRUST_META[level];

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 16px",
        background: isActionable ? COLORS.accentSoft : "rgba(11,11,13,0.025)",
        border: `1px solid ${isActionable ? "rgba(15,79,62,0.22)" : COLORS.borderSoft}`,
        borderRadius: 12,
      }}
    >
      <ClientTrustChip level={level} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 600,
            color: isActionable ? COLORS.accentDeep : COLORS.ink,
            lineHeight: 1.3,
          }}
        >
          {isActionable ? "Get Verified — open more talent inboxes" : `You're at ${meta.label}`}
        </div>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 12,
            color: COLORS.inkMuted,
            marginTop: 2,
            lineHeight: 1.45,
          }}
        >
          {isActionable
            ? "Verification confirms a real, traceable buyer. Talent that filters out anonymous inquiries will see your next message."
            : level === "verified"
              ? "Funded-balance activity earns Silver — no extra fee, just a stronger signal of buying readiness."
              : "Sustained activity + funded balance earns Trusted — the strongest trust signal Tulala issues."}
        </div>
      </div>
      {isActionable && onUpgrade && (
        <button
          onClick={onUpgrade}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: "8px 14px",
            background: COLORS.accent,
            color: "#fff",
            border: "none",
            borderRadius: 8,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Get Verified · $29
          <Icon name="arrow-right" size={11} stroke={2} color="#fff" />
        </button>
      )}
    </div>
  );
}

export function ReadOnlyChip() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: "transparent",
        color: COLORS.inkDim,
        border: `1px solid ${COLORS.border}`,
        fontFamily: FONTS.body,
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: 0.4,
        padding: "2px 7px",
        borderRadius: 999,
        textTransform: "uppercase",
      }}
    >
      <Icon name="lock" size={9} stroke={2} />
      Read only
    </span>
  );
}

export function StateChip({
  state,
  label,
}: {
  state: TalentProfile["state"];
  label: string;
}) {
  const tone = TALENT_STATE_TONE[state];
  const map: Record<typeof tone, { bg: string; fg: string; dot: string }> = {
    ink: { bg: "rgba(11,11,13,0.05)", fg: COLORS.ink, dot: COLORS.ink },
    amber: { bg: "rgba(82,96,109,0.10)", fg: "#3A4651", dot: COLORS.amber },
    green: { bg: "rgba(46,125,91,0.10)", fg: "#1F5C42", dot: COLORS.green },
    dim: { bg: "rgba(11,11,13,0.04)", fg: COLORS.inkMuted, dot: COLORS.inkDim },
  };
  const c = map[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: c.bg,
        color: c.fg,
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: 0.2,
        padding: "3px 8px 3px 7px",
        borderRadius: 999,
      }}
    >
      <span
        style={{
          display: "inline-block",
          width: 5,
          height: 5,
          borderRadius: "50%",
          background: c.dot,
        }}
      />
      {label}
    </span>
  );
}

export function IconChip({
  children,
  tone = "neutral",
  size = 32,
}: {
  children: ReactNode;
  tone?: "neutral" | "warm" | "ink";
  size?: number;
}) {
  const map: Record<typeof tone, CSSProperties> = {
    neutral: { background: "rgba(11,11,13,0.04)", color: COLORS.ink },
    warm: { background: COLORS.surfaceAlt, color: COLORS.ink },
    ink: { background: COLORS.fill, color: "#fff" },
  };
  return (
    <span
      style={{
        ...map[tone],
        width: size,
        height: size,
        borderRadius: 9,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      {children}
    </span>
  );
}

export function Affordance({
  label = "Open",
  arrow = true,
  color,
}: {
  label?: string;
  arrow?: boolean;
  color?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontFamily: FONTS.body,
        fontSize: 12,
        fontWeight: 500,
        color: color ?? COLORS.inkMuted,
        letterSpacing: 0.1,
      }}
    >
      {label}
      {arrow && <Icon name="arrow-right" size={12} stroke={1.8} />}
    </span>
  );
}

// ─── Card primitives ─────────────────────────────────────────────────

export type CardClickHandler = () => void;

type CardBase = {
  onClick?: CardClickHandler;
  children: ReactNode;
  style?: CSSProperties;
  className?: string;
  ariaLabel?: string;
  fullHeight?: boolean;
};

/**
 * Variants:
 *   primary    — flagship card, subtle resting shadow + lift on hover
 *   secondary  — softer companion card, no resting shadow
 *   status     — same chrome as secondary, used for KPI / metric tiles
 *   locked     — dashed border, dimmed background, never lifts
 *   starter    — neutral wash + accent-tinted border (formerly cream)
 *   accent     — NEW. Forest-accent-tinted wash with a left accent strip.
 *                Use sparingly for "earn this" / spotlight rows.
 */
type CardVariant = "primary" | "secondary" | "status" | "locked" | "starter" | "accent" | "action" | "premium";

const CARD_VARIANT_STYLES: Record<CardVariant, { rest: CSSProperties; hoverBorder: string; hoverShadow: string; lifts: boolean }> = {
  primary: {
    rest: {
      background: COLORS.card,
      border: `1px solid ${COLORS.border}`,
      boxShadow: COLORS.shadow,
    },
    hoverBorder: COLORS.borderStrong,
    hoverShadow: COLORS.shadowHover,
    lifts: true,
  },
  secondary: {
    rest: {
      background: COLORS.card,
      border: `1px solid ${COLORS.borderSoft}`,
      boxShadow: "none",
    },
    hoverBorder: COLORS.border,
    hoverShadow: COLORS.shadow,
    lifts: true,
  },
  status: {
    rest: {
      background: COLORS.card,
      border: `1px solid ${COLORS.borderSoft}`,
      boxShadow: "none",
    },
    hoverBorder: COLORS.border,
    hoverShadow: COLORS.shadow,
    lifts: false,
  },
  locked: {
    // "Preview / available on upgrade" — not "denied". Soft forest tint
    // signals "this is reachable" rather than the previous gray-dashed wall.
    rest: {
      background: "rgba(15,79,62,0.04)",
      border: `1px solid rgba(15,79,62,0.18)`,
      boxShadow: "none",
    },
    hoverBorder: "rgba(15,79,62,0.32)",
    hoverShadow: COLORS.shadow,
    lifts: true,
  },
  starter: {
    rest: {
      background: COLORS.surfaceAlt,
      border: `1px solid rgba(15,79,62,0.18)`,
      boxShadow: "none",
    },
    hoverBorder: "rgba(15,79,62,0.32)",
    hoverShadow: COLORS.shadow,
    lifts: true,
  },
  accent: {
    rest: {
      background: COLORS.accentSoft,
      border: `1px solid rgba(15,79,62,0.18)`,
      boxShadow: "none",
    },
    hoverBorder: "rgba(15,79,62,0.34)",
    hoverShadow: COLORS.shadowHover,
    lifts: true,
  },
  // "action" — for cards that need a do-this-now signal without using the
  // brand. Ink-led white surface with a coral left rule. Coral = "your move."
  // Replaces variant="accent" anywhere a card was forest-tinted purely to
  // signal urgency rather than identity. See docs/admin-redesign/color-system.md.
  action: {
    rest: {
      background: COLORS.card,
      border: `1px solid ${COLORS.borderSoft}`,
      boxShadow: "none",
    },
    hoverBorder: COLORS.coral,
    hoverShadow: COLORS.shadow,
    lifts: true,
  },
  // "premium" — paid tier / AI assist / unlock prompts. Royal soft wash with
  // a violet edge. Always paired with a crown or sparkle icon at use site.
  premium: {
    rest: {
      background: COLORS.royalSoft,
      border: `1px solid rgba(95,75,139,0.18)`,
      boxShadow: "none",
    },
    hoverBorder: "rgba(95,75,139,0.34)",
    hoverShadow: COLORS.shadowHover,
    lifts: true,
  },
};

function CardFrame({
  onClick,
  children,
  style,
  className,
  ariaLabel,
  fullHeight,
  variant = "primary",
}: CardBase & { variant?: CardVariant }) {
  const v = CARD_VARIANT_STYLES[variant];
  const interactive = Boolean(onClick);
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      aria-label={ariaLabel}
      className={className}
      style={{
        ...v.rest,
        textAlign: "left",
        padding: 0,
        margin: 0,
        position: "relative",
        cursor: interactive ? "pointer" : "default",
        borderRadius: 14,
        width: "100%",
        height: fullHeight ? "100%" : undefined,
        display: "block",
        transition: `border-color ${TRANSITION.sm}, transform ${TRANSITION.sm}, box-shadow ${TRANSITION.sm}`,
        outline: "none",
        font: "inherit",
        willChange: interactive ? "transform" : undefined,
        ...style,
      }}
      onMouseEnter={(e) => {
        if (!interactive) return;
        const t = e.currentTarget;
        const baseBorder = (v.rest.border as string) ?? "";
        // Replace just the color portion of the existing border declaration.
        const isDashed = baseBorder.includes("dashed");
        t.style.border = `1px ${isDashed ? "dashed" : "solid"} ${v.hoverBorder}`;
        t.style.boxShadow = v.hoverShadow;
        if (v.lifts) t.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        const t = e.currentTarget;
        t.style.border = v.rest.border as string;
        t.style.boxShadow = (v.rest.boxShadow as string) ?? "none";
        t.style.transform = "translateY(0)";
      }}
    >
      {/* Variants with a 3px left strip — hue carries the semantic.
          accent  = forest (brand identity moment)
          action  = coral  (your move / action-needed)
          premium = royal  (paid tier / AI / unlock) */}
      {(variant === "accent" || variant === "action" || variant === "premium") && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 12,
            bottom: 12,
            left: 0,
            width: 3,
            borderRadius: "0 3px 3px 0",
            background:
              variant === "action"
                ? COLORS.coral
                : variant === "premium"
                  ? COLORS.royal
                  : COLORS.accent,
          }}
        />
      )}
      {children}
    </button>
  );
}

export function PrimaryCard({
  title,
  description,
  icon,
  meta,
  affordance = "Open",
  onClick,
  fullHeight,
  footer,
  badge,
  children,
  variant = "primary",
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  affordance?: string;
  onClick?: CardClickHandler;
  fullHeight?: boolean;
  footer?: ReactNode;
  badge?: ReactNode;
  children?: ReactNode;
  /** Card-treatment lane:
   *  - "primary"  default white card
   *  - "accent"   forest-tinted spotlight (brand identity moment)
   *  - "action"   coral left rule on white (your-move / action-needed)
   *  - "premium"  royal-tinted (paid tier / AI / unlock prompt)
   *  See docs/admin-redesign/color-system.md for when to use each. */
  variant?: "primary" | "accent" | "action" | "premium";
}) {
  const hasLeftRule = variant === "accent" || variant === "action" || variant === "premium";
  return (
    <CardFrame onClick={onClick} variant={variant} fullHeight={fullHeight}>
      <div
        data-tulala-primary-card-body
        style={{
          padding: 18,
          paddingLeft: hasLeftRule ? 22 : 18,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          height: "100%",
        }}
      >
        <style>{`
          @media (max-width: 540px) {
            [data-tulala-primary-card-body] { padding: 14px !important; gap: 8px !important; }
          }
        `}</style>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          {icon && <IconChip>{icon}</IconChip>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
              <h3
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 16,
                  fontWeight: 500,
                  letterSpacing: -0.15,
                  color: COLORS.ink,
                  margin: 0,
                  lineHeight: 1.3,
                }}
              >
                {title}
              </h3>
              {badge}
            </div>
            {description && (
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  color: COLORS.inkMuted,
                  margin: 0,
                  lineHeight: 1.5,
                }}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        {children && <div style={{ flex: 1 }}>{children}</div>}
        {(meta || footer || onClick) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginTop: "auto",
              paddingTop: meta || footer ? 10 : 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.inkMuted, fontSize: 12 }}>
              {meta}
            </div>
            {footer ?? (onClick && <Affordance label={affordance} />)}
          </div>
        )}
      </div>
    </CardFrame>
  );
}

export function SecondaryCard({
  title,
  description,
  meta,
  affordance = "Open",
  onClick,
  children,
  fullHeight,
  variant = "secondary",
}: {
  title: string;
  description?: string;
  meta?: ReactNode;
  affordance?: string;
  onClick?: CardClickHandler;
  children?: ReactNode;
  fullHeight?: boolean;
  /** Pass "accent" for the forest-tinted spotlight treatment. */
  variant?: "secondary" | "accent";
}) {
  return (
    <CardFrame onClick={onClick} variant={variant} fullHeight={fullHeight}>
      <div data-tulala-secondary-card-body style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8, height: "100%" }}>
        <style>{`
          @media (max-width: 540px) {
            [data-tulala-secondary-card-body] { padding: 12px 14px !important; gap: 6px !important; }
          }
        `}</style>
        <div>
          <h3
            style={{
              fontFamily: FONTS.body,
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: -0.05,
              color: COLORS.ink,
              margin: 0,
              lineHeight: 1.35,
            }}
          >
            {title}
          </h3>
          {description && (
            <p
              style={{
                fontFamily: FONTS.body,
                fontSize: 12.5,
                color: COLORS.inkMuted,
                margin: "4px 0 0",
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          )}
        </div>
        {children && <div style={{ flex: 1 }}>{children}</div>}
        {(meta || onClick) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              marginTop: "auto",
              paddingTop: 6,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, color: COLORS.inkMuted, fontSize: 11.5 }}>
              {meta}
            </div>
            {onClick && <Affordance label={affordance} />}
          </div>
        )}
      </div>
    </CardFrame>
  );
}

// ════════════════════════════════════════════════════════════════════
// StatusStrip — premium 2026 replacement for the 4-up StatusCard grid.
// Single horizontal row of clickable counts. Used on Roster, Clients,
// Today, Operations etc. Each item: tone dot · label · big number.
// ════════════════════════════════════════════════════════════════════
export type StatusStripItem = {
  id: string;
  label: string;
  value: number | string;
  tone?: "green" | "amber" | "indigo" | "dim" | "ink" | "red";
  /** Optional click handler. Disables when count === 0. */
  onClick?: () => void;
  /** Active visual when this is the currently-selected filter. */
  active?: boolean;
};

export function StatusStrip({
  items,
  ariaLabel = "Status overview",
}: {
  items: StatusStripItem[];
  ariaLabel?: string;
}) {
  // Resolve tone color
  const toneColor = (t: StatusStripItem["tone"]) => {
    if (t === "green")  return COLORS.green;
    if (t === "amber")  return COLORS.amber;
    if (t === "indigo") return COLORS.indigoDeep;
    if (t === "red")    return COLORS.red;
    if (t === "dim")    return COLORS.inkMuted;
    return COLORS.ink;
  };
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      style={{
        display: "flex",
        alignItems: "stretch",
        gap: 0,
        padding: 4,
        borderRadius: 12,
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 1px 2px rgba(11,11,13,0.03)",
        marginBottom: 14,
        fontFamily: FONTS.body,
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {items.map((it, i) => {
        const isZero = it.value === 0;
        const clickable = it.onClick && !isZero;
        const Tag = clickable ? "button" : "div";
        return (
          <Tag
            key={it.id}
            type={clickable ? "button" : undefined}
            onClick={clickable ? it.onClick : undefined}
            disabled={!clickable && Tag === "button"}
            style={{
              flex: 1,
              minWidth: 96,
              padding: "10px 14px",
              border: "none",
              background: it.active ? "rgba(15,79,62,0.06)" : "transparent",
              borderRadius: 8,
              cursor: clickable ? "pointer" : "default",
              opacity: isZero ? 0.5 : 1,
              textAlign: "left",
              borderRight: i < items.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
              fontFamily: FONTS.body,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: toneColor(it.tone),
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, color: COLORS.inkMuted, fontWeight: 500, whiteSpace: "nowrap" }}>{it.label}</span>
            </div>
            <div
              style={{
                fontFamily: FONTS.display,
                fontSize: 22,
                fontWeight: 500,
                color: it.active ? COLORS.accentDeep : COLORS.ink,
                letterSpacing: -0.4,
                lineHeight: 1,
              }}
            >
              {it.value}
            </div>
          </Tag>
        );
      })}
    </div>
  );
}

// Plan-locked pill — single canonical chrome for "this is locked behind X plan".
// Used inline next to features. Click → opens the upgrade flow.
export function PlanLockPill({
  plan,
  onClick,
  size = "md",
}: {
  plan: "studio" | "agency" | "network";
  onClick?: () => void;
  size?: "sm" | "md";
}) {
  const meta: Record<typeof plan, { label: string; bg: string; fg: string }> = {
    studio:  { label: "Studio",  bg: "rgba(91,107,160,0.10)",  fg: "#3B4A75" },
    agency:  { label: "Agency",  bg: "rgba(184,135,49,0.14)",  fg: "#7A5A1F" },
    network: { label: "Network", bg: "rgba(15,79,62,0.10)",    fg: COLORS.accentDeep },
  };
  const m = meta[plan];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: size === "sm" ? "2px 7px" : "3px 9px",
        borderRadius: 999,
        border: "none",
        background: m.bg,
        color: m.fg,
        fontFamily: FONTS.body,
        fontSize: size === "sm" ? 10 : 11,
        fontWeight: 600,
        cursor: onClick ? "pointer" : "default",
        textTransform: "capitalize",
      }}
    >
      <span style={{ fontSize: size === "sm" ? 9 : 10 }}>🔒</span>
      {m.label}
    </button>
  );
}

// ════════════════════════════════════════════════════════════════════
// Trust & Verification primitives
// ════════════════════════════════════════════════════════════════════

import type { VerificationType, ProfileClaimStatus, TrustSummary } from "./_state";
import { VERIFICATION_TYPE_META, PROFILE_CLAIM_META } from "./_state";

/** Single verification badge — one row in a TrustBadgeGroup. */
export function TrustBadge({
  type,
  identifier,
  size = "md",
  showLabel = true,
}: {
  type: VerificationType;
  identifier?: string | null;
  size?: "xs" | "sm" | "md";
  showLabel?: boolean;
}) {
  const meta = VERIFICATION_TYPE_META[type];
  const labelText = type === "agency_confirmed" && identifier
    ? `Represented by ${identifier === "atelier-roma" ? "Atelier Roma" : identifier}`
    : meta.shortLabel;
  const fontSize = size === "xs" ? 10 : size === "sm" ? 10.5 : 11;
  const padY = size === "xs" ? 2 : 3;
  const padX = size === "xs" ? 6 : size === "sm" ? 8 : 9;
  return (
    <span
      title={meta.tooltip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: `${padY}px ${padX}px`,
        borderRadius: 999,
        background: meta.bg,
        color: meta.fg,
        fontFamily: FONTS.body,
        fontSize,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      <span aria-hidden style={{ fontSize: fontSize + 1, lineHeight: 1 }}>{meta.emoji}</span>
      {showLabel && labelText}
    </span>
  );
}

/** Profile claim status chip — Unclaimed / Invite sent / Claimed / etc. */
export function ProfileClaimStatusChip({
  status,
  size = "md",
}: {
  status: ProfileClaimStatus;
  size?: "xs" | "sm" | "md";
}) {
  const meta = PROFILE_CLAIM_META[status];
  const fontSize = size === "xs" ? 10 : size === "sm" ? 10.5 : 11;
  return (
    <span
      title={meta.helper}
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: `${size === "xs" ? 2 : 3}px ${size === "xs" ? 6 : 9}px`,
        borderRadius: 999,
        background: meta.bg,
        color: meta.fg,
        fontFamily: FONTS.body,
        fontSize,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {meta.shortLabel}
    </span>
  );
}

/** Compact trust badge group — selects which badges are appropriate
 *  for the given surface and renders them. */
// ════════════════════════════════════════════════════════════════════
// ProfilePhotoBadgeOverlay — modern corner verified icons (Instagram /
// X-style checkmarks). Renders 1-2 small badges absolute-positioned in
// the bottom-right of a profile photo. Uses real brand-recognizable
// glyphs (IG gradient circle, forest green checkmark).
//
// Usage: place inside the photo's positioned container.
//   <div style={{ position: "relative" }}>
//     <img ... />
//     <ProfilePhotoBadgeOverlay trust={...} size="md" />
//   </div>
// ════════════════════════════════════════════════════════════════════

const VERIFIED_BADGE_PRIORITY: VerificationType[] = [
  "tulala_verified",
  "instagram_verified",
  "agency_confirmed",
  "business_verified",
  "domain_verified",
  "payment_verified",
];

export function ProfilePhotoBadgeOverlay({
  trust,
  size = "md",
  max = 2,
  position = "bottom-right",
}: {
  trust: TrustSummary;
  size?: "xs" | "sm" | "md" | "lg";
  max?: number;
  position?: "bottom-right" | "bottom-left" | "top-right";
}) {
  // Public-eligible active badges only — corner overlay is a public
  // signal so it must respect the same visibility rules as the
  // public surface.
  const publicBadges = trust.badges
    .filter(b => b.public && VERIFICATION_TYPE_META[b.type].publicEligible && b.status === "active" && b.methodEnabled !== false)
    .sort((a, b) => VERIFIED_BADGE_PRIORITY.indexOf(a.type) - VERIFIED_BADGE_PRIORITY.indexOf(b.type))
    .slice(0, max);

  if (publicBadges.length === 0) return null;

  const dim = size === "xs" ? 14 : size === "sm" ? 18 : size === "lg" ? 28 : 22;
  const offset = size === "xs" ? 2 : size === "sm" ? 3 : size === "lg" ? 6 : 4;
  const fontSize = size === "xs" ? 8 : size === "sm" ? 10 : size === "lg" ? 16 : 12;

  const positionStyle: React.CSSProperties = position === "bottom-right" ? { bottom: offset, right: offset }
    : position === "bottom-left" ? { bottom: offset, left: offset }
    : { top: offset, right: offset };

  return (
    <div
      data-tulala-photo-badges
      style={{
        position: "absolute",
        ...positionStyle,
        display: "flex",
        flexDirection: "row",
        alignItems: "center",
        gap: -2,
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      {publicBadges.map((b, i) => (
        <PhotoBadgeIcon
          key={b.type}
          type={b.type}
          dim={dim}
          fontSize={fontSize}
          tooltip={b.tooltip}
          // Stack overlap when multiple badges
          marginLeft={i === 0 ? 0 : -dim * 0.3}
          ringColor="#fff"
        />
      ))}
    </div>
  );
}

/**
 * One verified-style badge icon. Distinctive per type:
 *   - instagram_verified → Instagram-style gradient circle + white checkmark
 *   - tulala_verified    → forest-green disc + checkmark (Tulala brand)
 *   - agency_confirmed   → indigo disc + sparkle
 *   - business_verified  → gold disc + building icon
 *   - domain_verified    → indigo disc + globe
 *   - payment_verified   → green disc + card icon
 */
function PhotoBadgeIcon({
  type, dim, fontSize, tooltip, marginLeft, ringColor,
}: {
  type: VerificationType;
  dim: number;
  fontSize: number;
  tooltip: string;
  marginLeft: number;
  ringColor: string;
}) {
  const ringWidth = dim < 18 ? 1.5 : 2;

  if (type === "instagram_verified") {
    // Instagram-recognizable gradient: yellow → orange → red → purple
    return (
      <span
        title={tooltip}
        aria-label="Instagram Verified"
        style={{
          width: dim, height: dim, borderRadius: "50%",
          background: "linear-gradient(135deg, #F09433 0%, #E6683C 25%, #DC2743 50%, #CC2366 75%, #BC1888 100%)",
          boxShadow: `0 0 0 ${ringWidth}px ${ringColor}, 0 1px 3px rgba(11,11,13,0.20)`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          marginLeft,
          flexShrink: 0,
        }}
      >
        <svg width={Math.round(dim * 0.55)} height={Math.round(dim * 0.55)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }

  if (type === "tulala_verified") {
    // Tulala brand — forest green disc with checkmark. Modeled on Twitter/X
    // verified visual so users recognize it as "platform-verified"
    return (
      <span
        title={tooltip}
        aria-label="Tulala Verified"
        style={{
          width: dim, height: dim, borderRadius: "50%",
          background: COLORS.accent,
          boxShadow: `0 0 0 ${ringWidth}px ${ringColor}, 0 1px 3px rgba(11,11,13,0.20)`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          marginLeft,
          flexShrink: 0,
        }}
      >
        <svg width={Math.round(dim * 0.62)} height={Math.round(dim * 0.62)} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </span>
    );
  }

  if (type === "agency_confirmed") {
    return (
      <span
        title={tooltip}
        aria-label="Agency Confirmed"
        style={{
          width: dim, height: dim, borderRadius: "50%",
          background: "#3B4A75",
          boxShadow: `0 0 0 ${ringWidth}px ${ringColor}, 0 1px 3px rgba(11,11,13,0.20)`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: Math.round(dim * 0.55),
          fontWeight: 700,
          marginLeft,
          flexShrink: 0,
        }}
      >✦</span>
    );
  }

  if (type === "business_verified") {
    return (
      <span
        title={tooltip}
        aria-label="Business Verified"
        style={{
          width: dim, height: dim, borderRadius: "50%",
          background: "#7A5A1F",
          boxShadow: `0 0 0 ${ringWidth}px ${ringColor}, 0 1px 3px rgba(11,11,13,0.20)`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
          fontSize: Math.round(dim * 0.50),
          marginLeft,
          flexShrink: 0,
        }}
      >🏢</span>
    );
  }

  // Generic: emoji + tooltip
  const meta = VERIFICATION_TYPE_META[type];
  return (
    <span
      title={tooltip}
      aria-label={meta.label}
      style={{
        width: dim, height: dim, borderRadius: "50%",
        background: meta.fg,
        boxShadow: `0 0 0 ${ringWidth}px ${ringColor}, 0 1px 3px rgba(11,11,13,0.20)`,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        color: "#fff",
        fontSize: Math.round(dim * 0.55),
        marginLeft,
        flexShrink: 0,
      }}
    >{meta.emoji}</span>
  );
}

/** Risk/health score badge for admin surfaces only — never publicly
 *  visible. Numeric 0-100 score from getRiskScore, color-coded.
 *  Higher = more trustworthy. */
export function RiskScorePill({ score, label = "Trust health" }: { score: number; label?: string }) {
  const tone =
    score >= 70 ? { bg: "rgba(15,79,62,0.10)", fg: "#0F4F3E", word: "healthy" }
    : score >= 40 ? { bg: "rgba(176,135,49,0.14)", fg: "#7A5A1F", word: "watchful" }
    : { bg: "rgba(176,48,58,0.10)", fg: "#7A1F26", word: "review" };
  return (
    <div title={`Internal heuristic — verifications, claim status, account age, recent rejections.`} style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "5px 11px", borderRadius: 999,
      background: tone.bg, color: tone.fg,
      fontFamily: "inherit", fontSize: 11.5, fontWeight: 600,
    }}>
      <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700 }}>{score}</span>
      <span style={{ fontSize: 10.5, opacity: 0.8 }}>· {tone.word}</span>
    </div>
  );
}

export function TrustBadgeGroup({
  trust,
  surface,
  size = "sm",
  max = 3,
}: {
  trust: TrustSummary;
  surface: "public_profile" | "admin_roster" | "client_inquiry" | "talent_inbox" | "coordinator_workspace" | "chat_header" | "admin_detail";
  size?: "xs" | "sm" | "md";
  max?: number;
}) {
  // Public surfaces — only public-eligible active badges of methods
  // currently enabled platform-wide. Method gate is enforced here so a
  // platform-admin disable instantly hides the badge from storefronts,
  // Discover, and roster cards (admin views still see it, annotated).
  const publicBadges = trust.badges.filter(b => b.public && VERIFICATION_TYPE_META[b.type].publicEligible && b.methodEnabled !== false);
  // Admin surfaces can see everything including pending state
  const isAdminSurface = surface === "admin_roster" || surface === "admin_detail";
  const isChatLikeSurface = surface === "chat_header" || surface === "client_inquiry" || surface === "talent_inbox" || surface === "coordinator_workspace";

  const badgesToShow = (isAdminSurface ? trust.badges : publicBadges).slice(0, max);

  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      flexWrap: "wrap",
    }}>
      {/* Claim status — only on admin/internal surfaces */}
      {(isAdminSurface || isChatLikeSurface) && trust.claimStatus && trust.claimStatus !== "claimed" && (
        <ProfileClaimStatusChip status={trust.claimStatus} size={size} />
      )}
      {badgesToShow.map(b => (
        <span key={b.type} style={{ position: "relative", display: "inline-flex" }}
          title={b.methodEnabled === false ? `${VERIFICATION_TYPE_META[b.type].label} · method disabled platform-wide (still active until expiry)` : undefined}>
          <TrustBadge type={b.type} identifier={b.identifier} size={size} showLabel={size !== "xs"} />
          {isAdminSurface && b.methodEnabled === false && (
            <span aria-hidden style={{
              position: "absolute", top: -3, right: -3,
              width: 8, height: 8, borderRadius: "50%",
              background: "rgba(11,11,13,0.45)", border: "1.5px solid #fff",
            }} />
          )}
        </span>
      ))}
      {/* Pending indicator — admin/internal only */}
      {isAdminSurface && trust.pendingRequests.length > 0 && (
        <span
          title={trust.pendingRequests.map(r => `${VERIFICATION_TYPE_META[r.verificationType].shortLabel} · ${r.status.replace(/_/g, " ")}`).join("\n")}
          style={{
            display: "inline-flex", alignItems: "center", gap: 3,
            padding: "3px 8px", borderRadius: 999,
            background: "rgba(82,96,109,0.10)", color: "#3A4651",
            fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 600,
          }}
        >
          ◌ {trust.pendingRequests.length} pending
        </span>
      )}
      {/* Empty state for chat-like surfaces — neutral copy */}
      {isChatLikeSurface && publicBadges.length === 0 && trust.pendingRequests.length === 0 && (
        <span style={{
          display: "inline-flex", alignItems: "center",
          padding: "3px 9px", borderRadius: 999,
          background: "rgba(11,11,13,0.05)",
          color: "rgba(11,11,13,0.55)",
          fontFamily: FONTS.body, fontSize: 10.5, fontWeight: 500,
        }}>Not yet verified</span>
      )}
    </span>
  );
}

export function StatusCard({
  value,
  label,
  caption,
  onClick,
  tone,
  icon,
}: {
  value: string | number;
  label: string;
  caption?: string;
  onClick?: CardClickHandler;
  tone?: "ink" | "amber" | "green" | "dim" | "coral" | "indigo";
  /**
   * Optional icon — sits next to the label in a small color-tinted
   * chip. Picks tint from `tone`. Use to make hero metrics scannable
   * at a glance (e.g. credit icon next to "Paid this month").
   */
  icon?:
    | "calendar"
    | "credit"
    | "mail"
    | "bolt"
    | "user"
    | "team"
    | "sparkle";
}) {
  // Tone tints the metric value AND optional icon chip.
  const tonePalette = {
    green: { value: COLORS.green, chipBg: "rgba(46,125,91,0.10)", chipFg: COLORS.green },
    amber: { value: COLORS.amber, chipBg: "rgba(82,96,109,0.10)", chipFg: COLORS.amber },
    coral: { value: COLORS.coral, chipBg: COLORS.coralSoft, chipFg: COLORS.coral },
    indigo: { value: COLORS.indigo, chipBg: COLORS.indigoSoft, chipFg: COLORS.indigo },
    ink: { value: COLORS.ink, chipBg: "rgba(11,11,13,0.06)", chipFg: COLORS.ink },
    dim: { value: COLORS.ink, chipBg: "rgba(11,11,13,0.06)", chipFg: COLORS.inkMuted },
  } as const;
  const palette = tone ? tonePalette[tone] : tonePalette.ink;
  // Combined a11y label so screen readers hear the metric in plain
  // language (Wave 0 audit fix).
  const ariaLabel = `${label}: ${value}${caption ? `, ${caption}` : ""}`;
  return (
    <CardFrame onClick={onClick} variant="status" ariaLabel={onClick ? ariaLabel : undefined}>
      <div
        style={{
          padding: 20,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          minHeight: 116,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {icon && (
            <span
              aria-hidden
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: palette.chipBg,
                color: palette.chipFg,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              <Icon name={icon} size={12} stroke={1.7} />
            </span>
          )}
          <div
            style={{
              fontFamily: FONTS.body,
              fontSize: 11.5,
              fontWeight: 500,
              color: COLORS.inkMuted,
              letterSpacing: 0.05,
            }}
          >
            {label}
          </div>
        </div>
        <div
          style={{
            fontFamily: FONTS.display,
            fontSize: 32,
            fontWeight: 500,
            color: palette.value,
            letterSpacing: -0.6,
            lineHeight: 1,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
        {caption && <StatusCaption text={caption} />}
      </div>
    </CardFrame>
  );
}

/**
 * Caption renderer that detects a trailing trend token like "+18%" or
 * "−4%" and tints it green/red. Falls back to plain muted ink. Keeps the
 * surrounding text neutral so the trend reads as a sentiment signal.
 */
function StatusCaption({ text }: { text: string }) {
  // Match a leading + or − (Unicode minus, ASCII -, en-dash) followed by
  // digits and an optional %, anywhere in the string. We only style the
  // first match so multi-trend captions don't blow up.
  const match = text.match(/([+\-−–][\d.,]+%?)/);
  if (!match) {
    return (
      <div
        style={{
          fontFamily: FONTS.body,
          fontSize: 12,
          color: COLORS.inkMuted,
        }}
      >
        {text}
      </div>
    );
  }
  const before = text.slice(0, match.index ?? 0);
  const after = text.slice((match.index ?? 0) + match[0].length);
  const trend = match[0];
  const isPositive = /^[+]/.test(trend);
  const trendColor = isPositive ? COLORS.green : COLORS.red;
  return (
    <div
      style={{
        fontFamily: FONTS.body,
        fontSize: 12,
        color: COLORS.inkMuted,
      }}
    >
      {before}
      <span
        style={{
          color: trendColor,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {trend}
      </span>
      {after}
    </div>
  );
}

export function LockedCard({
  title,
  description,
  requiredPlan,
  onClick,
  affordance = "Unlock",
  fullHeight,
}: {
  title: string;
  description?: string;
  requiredPlan: Plan;
  onClick?: CardClickHandler;
  affordance?: string;
  fullHeight?: boolean;
}) {
  return (
    <CardFrame onClick={onClick} variant="locked" fullHeight={fullHeight}>
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              background: COLORS.accentSoft,
              border: `1px solid rgba(15,79,62,0.22)`,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: COLORS.accent,
              flexShrink: 0,
            }}
          >
            <Icon name="sparkle" size={13} stroke={1.7} color={COLORS.accent} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3
              style={{
                fontFamily: FONTS.display,
                fontSize: 18,
                fontWeight: 500,
                color: COLORS.ink,
                margin: 0,
                lineHeight: 1.25,
              }}
            >
              {title}
            </h3>
            {description && (
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 12.5,
                  color: COLORS.inkMuted,
                  margin: "2px 0 0",
                  lineHeight: 1.5,
                }}
              >
                {description}
              </p>
            )}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            marginTop: "auto",
            paddingTop: 6,
          }}
        >
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "3px 8px",
              borderRadius: 999,
              background: "#fff",
              border: `1px solid rgba(15,79,62,0.20)`,
              fontFamily: FONTS.body,
              fontSize: 11,
              fontWeight: 600,
              color: COLORS.accentDeep,
              letterSpacing: 0.2,
            }}
          >
            {PLAN_META[requiredPlan].label} · {planPriceCompact(requiredPlan)}
          </div>
          {onClick && <Affordance label={affordance} color={COLORS.accent} />}
        </div>
      </div>
    </CardFrame>
  );
}

export function CompactLockedCard({
  title,
  requiredPlan,
  onClick,
}: {
  title: string;
  requiredPlan: Plan;
  onClick?: CardClickHandler;
}) {
  return (
    <CardFrame onClick={onClick} variant="locked">
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
        <Icon name="sparkle" size={12} stroke={1.7} color={COLORS.accent} />
        <span
          style={{
            fontFamily: FONTS.body,
            fontSize: 13,
            fontWeight: 500,
            color: COLORS.ink,
            flex: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </span>
        <span
          style={{
            fontFamily: FONTS.body,
            fontSize: 11,
            fontWeight: 600,
            color: COLORS.accentDeep,
            letterSpacing: 0.2,
            whiteSpace: "nowrap",
          }}
        >
          {PLAN_META[requiredPlan].label} · {planPriceCompact(requiredPlan)}
        </span>
      </div>
    </CardFrame>
  );
}

export function StarterCard({
  title,
  subtitle,
  children,
  onPrimary,
  primaryLabel,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  onPrimary?: () => void;
  primaryLabel?: string;
}) {
  return (
    <div
      data-tulala-starter-card
      style={{
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: 16,
        position: "relative",
        overflow: "hidden",
        boxShadow: COLORS.shadow,
      }}
    >
      <style>{`
        @media (max-width: 540px) {
          /* On phones the surrounding "card frame" feels heavier than its
             content. Strip the border + soften the bg so the activation
             list reads as a simple section, not an island. */
          [data-tulala-starter-card] {
            padding: 10px 0 !important;
            border-radius: 0 !important;
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
          }
          [data-tulala-starter-card] > span[aria-hidden] { display: none !important; }
        }
      `}</style>
      {/* Subtle forest-accent strip — keeps the "spotlight / earn this" semantic
          the cream + brass used to carry, without the warm aesthetic. */}
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 16,
          bottom: 16,
          width: 3,
          borderRadius: "0 3px 3px 0",
          background: COLORS.accent,
        }}
      />
      <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 10,
            background: COLORS.accentSoft,
            color: COLORS.accent,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="sparkle" size={16} stroke={1.8} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              fontFamily: FONTS.display,
              fontSize: 16,
              fontWeight: 700,
              color: COLORS.ink,
              margin: 0,
              letterSpacing: -0.2,
              lineHeight: 1.25,
            }}
          >
            {title}
          </h3>
          {subtitle && (
            <p
              style={{
                fontFamily: FONTS.body,
                fontSize: 13,
                color: COLORS.inkMuted,
                margin: "4px 0 0",
                lineHeight: 1.55,
                maxWidth: 640,
              }}
            >
              {subtitle}
            </p>
          )}
          {children && <div style={{ marginTop: 14 }}>{children}</div>}
          {onPrimary && primaryLabel && (
            <div style={{ marginTop: 16 }}>
              <PrimaryButton onClick={onPrimary}>{primaryLabel}</PrimaryButton>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Inline "you're approaching/at your cap" nudge bar.
 * Only renders when usage ≥ `triggerAt` (default 0.8 — 80% of cap).
 * At/over cap renders in red urgency tone; otherwise forest-accent informational.
 *
 * Designed for placement above the list/grid the cap governs — e.g. the
 * roster grid on the Talent page, the team table on Settings → Team.
 */
export function CapNudge({
  label,
  current,
  cap,
  triggerAt = 0.8,
  onUpgrade,
  upgradeLabel = "Upgrade",
  message,
}: {
  /** Short noun for the metric ("talents", "team seats", "saved searches"). */
  label: string;
  current: number;
  cap: number;
  /** Show the nudge when usage / cap ≥ this. Default 0.8. */
  triggerAt?: number;
  onUpgrade?: () => void;
  upgradeLabel?: string;
  /** Optional override for the body copy. */
  message?: string;
}) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  if (cap <= 0) return null;
  const ratio = current / cap;
  if (ratio < triggerAt) return null;

  const blocking = current >= cap;
  const remaining = Math.max(0, cap - current);
  const defaultMessage = blocking
    ? `You're at the limit. New ${label} can't be added until you upgrade.`
    : `${remaining} ${label.replace(/s$/, "") + (remaining === 1 ? "" : "s")} left before you hit the cap.`;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: blocking ? "rgba(176,48,58,0.05)" : COLORS.accentSoft,
        border: `1px solid ${blocking ? "rgba(176,48,58,0.30)" : "rgba(15,79,62,0.22)"}`,
        borderRadius: 10,
        marginBottom: 16,
      }}
    >
      <span
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          background: "#fff",
          color: blocking ? COLORS.red : COLORS.accent,
          border: `1px solid ${blocking ? "rgba(176,48,58,0.32)" : "rgba(15,79,62,0.22)"}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={blocking ? "info" : "sparkle"} size={11} stroke={1.8} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 600,
            color: blocking ? COLORS.red : COLORS.accentDeep,
            lineHeight: 1.3,
          }}
        >
          {current} of {cap} {label} used
        </div>
        <div
          style={{
            fontFamily: FONTS.body,
            fontSize: 12,
            color: COLORS.inkMuted,
            marginTop: 1,
            lineHeight: 1.4,
          }}
        >
          {message ?? defaultMessage}
        </div>
      </div>
      {onUpgrade && (
        <button
          onClick={onUpgrade}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            padding: "6px 11px",
            background: blocking ? COLORS.red : COLORS.accent,
            color: "#fff",
            border: "none",
            borderRadius: 7,
            cursor: "pointer",
            fontFamily: FONTS.body,
            fontSize: 12,
            fontWeight: 600,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          {upgradeLabel}
          <Icon name="arrow-right" size={10} stroke={2} color="#fff" />
        </button>
      )}
      {!blocking && (
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          style={{
            width: 22,
            height: 22,
            borderRadius: 5,
            border: "none",
            background: "transparent",
            color: COLORS.inkDim,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <Icon name="x" size={11} stroke={2} />
        </button>
      )}
    </div>
  );
}

/**
 * Generic empty-state block. Replaces the previous "No X yet" gray-text
 * dead-ends with a properly framed call to action.
 *
 * Goals:
 *  - Always offer a primary action (or document why none is appropriate).
 *  - Keep visual weight light — borderless wash, modest icon — so it
 *    doesn't compete with real content nearby.
 *  - Title + body + CTA structure so empty surfaces read as "do this next",
 *    not "nothing here".
 */
export function EmptyState({
  icon = "sparkle",
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  compact = false,
  tips,
}: {
  icon?:
    | "sparkle"
    | "plus"
    | "search"
    | "mail"
    | "calendar"
    | "user"
    | "team"
    | "info";
  title: string;
  body?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Tighten padding for inline use inside drawers / cards. */
  compact?: boolean;
  /**
   * Optional list of concrete next-actions (3 items max). Each renders
   * as a clickable row below the body copy — gives empty states a
   * "here's what to do next" feel rather than a dead-end. Suggested for
   * any first-run / zero-data surface.
   */
  tips?: { label: string; description?: string; onClick?: () => void }[];
}) {
  const pad = compact ? "20px 16px" : "32px 20px";
  return (
    <div
      style={{
        padding: pad,
        textAlign: "center",
        fontFamily: FONTS.body,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
      }}
    >
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 10,
          background: COLORS.accentSoft,
          color: COLORS.accent,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 10,
        }}
      >
        <Icon name={icon} size={16} stroke={1.7} color={COLORS.accent} />
      </div>
      <h3
        style={{
          fontFamily: FONTS.display,
          fontSize: 17,
          fontWeight: 500,
          color: COLORS.ink,
          margin: 0,
          letterSpacing: -0.15,
          lineHeight: 1.3,
        }}
      >
        {title}
      </h3>
      {body && (
        <p
          style={{
            fontSize: 12.5,
            color: COLORS.inkMuted,
            margin: "2px 0 0",
            lineHeight: 1.5,
            maxWidth: 360,
          }}
        >
          {body}
        </p>
      )}
      {(primaryLabel || secondaryLabel) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          {secondaryLabel && onSecondary && (
            <SecondaryButton size="sm" onClick={onSecondary}>
              {secondaryLabel}
            </SecondaryButton>
          )}
          {primaryLabel && onPrimary && (
            <PrimaryButton onClick={onPrimary}>{primaryLabel}</PrimaryButton>
          )}
        </div>
      )}
      {tips && tips.length > 0 && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 6,
            marginTop: 18,
            width: "100%",
            maxWidth: 380,
            textAlign: "left",
          }}
        >
          {tips.slice(0, 3).map((tip, idx) => (
            <EmptyStateTip
              key={idx}
              index={idx + 1}
              label={tip.label}
              description={tip.description}
              onClick={tip.onClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmptyStateTip({
  index,
  label,
  description,
  onClick,
}: {
  index: number;
  label: string;
  description?: string;
  onClick?: () => void;
}) {
  const numberChip = (
    <span
      aria-hidden
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        background: COLORS.accentSoft,
        color: COLORS.accentDeep,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: 700,
        flexShrink: 0,
      }}
    >
      {index}
    </span>
  );
  const labels = (
    <div style={{ flex: 1, minWidth: 0 }}>
      <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.35 }}>{label}</div>
      {description && (
        <div
          style={{
            fontSize: 11.5,
            color: COLORS.inkMuted,
            marginTop: 2,
            lineHeight: 1.4,
          }}
        >
          {description}
        </div>
      )}
    </div>
  );
  const sharedStyle: CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    padding: "10px 12px",
    background: "#fff",
    border: `1px solid ${COLORS.borderSoft}`,
    borderRadius: 9,
    textAlign: "left",
    fontFamily: FONTS.body,
    color: COLORS.ink,
    transition: `border-color ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
  };
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        style={{ ...sharedStyle, cursor: "pointer", width: "100%" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = COLORS.border;
          e.currentTarget.style.boxShadow = COLORS.shadowHover;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = COLORS.borderSoft;
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        {numberChip}
        {labels}
        <Icon name="chevron-right" size={12} color={COLORS.inkDim} />
      </button>
    );
  }
  return (
    <div style={sharedStyle}>
      {numberChip}
      {labels}
    </div>
  );
}

/**
 * Celebration banner for milestone moments — first booking, first €1k month,
 * 10th confirmed booking, etc. Visual goal: feel warm without screaming.
 *
 *  - Soft accent gradient wash (no full saturation; keeps frequency-budget
 *    discipline — celebrations are rare, single-card events).
 *  - Optional dismiss × so the user can clear it once acknowledged.
 *  - Optional secondary action ("Share", "View receipt") to convert the
 *    moment into a next step.
 *
 * Caller decides when to show. The component is dumb. The expectation is
 * that production wires this to a `talent_celebration_events` row and
 * dismissing here writes `dismissed_at`.
 */
export function CelebrationBanner({
  eyebrow,
  title,
  body,
  primaryLabel,
  onPrimary,
  secondaryLabel,
  onSecondary,
  onDismiss,
  tone = "accent",
}: {
  eyebrow?: string;
  title: string;
  body?: string;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  onDismiss?: () => void;
  /** Forest = milestone you earned (income, badges); accent = brand celebration. */
  tone?: "accent" | "forest";
}) {
  const accent = tone === "forest" ? COLORS.green : COLORS.accent;
  const wash = tone === "forest" ? "rgba(46,125,91,0.10)" : COLORS.accentSoft;
  return (
    <section
      style={{
        position: "relative",
        background: `linear-gradient(135deg, ${wash} 0%, #fff 60%)`,
        border: `1px solid ${accent}`,
        borderRadius: 14,
        padding: "16px 18px 16px 18px",
        fontFamily: FONTS.body,
        display: "flex",
        alignItems: "center",
        gap: 16,
        overflow: "hidden",
      }}
    >
      <div
        aria-hidden
        style={{
          width: 38,
          height: 38,
          borderRadius: 12,
          background: "#fff",
          border: `1px solid ${accent}`,
          color: accent,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          boxShadow: `0 0 0 4px ${wash}`,
        }}
      >
        <Icon name="sparkle" size={17} stroke={1.7} color={accent} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && (
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.7,
              textTransform: "uppercase",
              color: accent,
              marginBottom: 3,
            }}
          >
            {eyebrow}
          </div>
        )}
        <h3
          style={{
            fontFamily: FONTS.display,
            fontSize: 17,
            fontWeight: 500,
            color: COLORS.ink,
            margin: 0,
            letterSpacing: -0.15,
            lineHeight: 1.3,
          }}
        >
          {title}
        </h3>
        {body && (
          <p
            style={{
              fontSize: 12.5,
              color: COLORS.inkMuted,
              margin: "4px 0 0",
              lineHeight: 1.5,
            }}
          >
            {body}
          </p>
        )}
        {(primaryLabel || secondaryLabel) && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}>
            {primaryLabel && onPrimary && (
              <PrimaryButton size="sm" onClick={onPrimary}>{primaryLabel}</PrimaryButton>
            )}
            {secondaryLabel && onSecondary && (
              <SecondaryButton size="sm" onClick={onSecondary}>
                {secondaryLabel}
              </SecondaryButton>
            )}
          </div>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          aria-label="Dismiss"
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 22,
            height: 22,
            borderRadius: 6,
            border: "none",
            background: "transparent",
            color: COLORS.inkMuted,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.06)")}
          onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
        >
          <Icon name="x" size={11} />
        </button>
      )}
    </section>
  );
}

/**
 * Real date picker primitive (F9). Replaces TextInput placeholders with a
 * native HTML5 date input styled to match the rest of the form system.
 * Native is the right call here:
 *  - Mobile gets the OS date wheel for free.
 *  - Keyboard nav works without a custom focus trap.
 *  - Locale-aware formatting comes from the browser.
 *
 * For range pickers (start + end) compose two of these side by side.
 */
export function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  min,
  max,
}: {
  value?: string;
  onChange?: (v: string) => void;
  placeholder?: string;
  min?: string;
  max?: string;
}) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 8,
        padding: "0 10px",
        height: 44,
        minHeight: 44,
        fontFamily: FONTS.body,
      }}
    >
      <Icon name="calendar" size={13} color={COLORS.inkMuted} />
      <input
        type="date"
        value={value ?? ""}
        onChange={(e) => onChange?.(e.target.value)}
        min={min}
        max={max}
        style={{
          flex: 1,
          padding: "0 0 0 8px",
          border: "none",
          outline: "none",
          background: "transparent",
          fontFamily: FONTS.body,
          fontSize: 13,
          color: value ? COLORS.ink : "transparent",
        }}
      />
      {/* Placeholder overlay — native date inputs don't show placeholder text */}
      {!value && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 36,
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            fontFamily: FONTS.body,
            fontSize: 13,
            color: COLORS.inkMuted,
          }}
        >
          {placeholder}
        </span>
      )}
    </div>
  );
}

/**
 * Loading skeleton for a list row (F3). Lightweight stand-in while a
 * surface is fetching — keeps the layout from collapsing as data loads
 * and prevents the "spinner-then-flash" feel.
 *
 * Defaults to one shimmering bar; pass `lines={n}` for a stack. Width
 * is 100% by default so it tracks the container.
 *
 * Note: animation is a CSS-class linear-gradient sweep declared inline
 * so the prototype doesn't depend on an external stylesheet.
 */
export function RowSkeleton({
  lines = 1,
  height = 14,
  rounded = 6,
}: {
  lines?: number;
  height?: number;
  rounded?: number;
}) {
  return (
    <div
      aria-busy="true"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 0",
      }}
    >
      <style>{`
        @keyframes tulala-skeleton-shimmer {
          0% { background-position: -240px 0; }
          100% { background-position: 240px 0; }
        }
      `}</style>
      {Array.from({ length: lines }).map((_, idx) => (
        <span
          key={idx}
          aria-hidden
          style={{
            display: "block",
            width: idx === lines - 1 && lines > 1 ? "60%" : "100%",
            height,
            borderRadius: rounded,
            background: `linear-gradient(90deg, rgba(11,11,13,0.04) 0%, rgba(11,11,13,0.10) 50%, rgba(11,11,13,0.04) 100%)`,
            backgroundSize: "240px 100%",
            backgroundRepeat: "no-repeat",
            backgroundColor: "rgba(11,11,13,0.04)",
            animation: "tulala-skeleton-shimmer 1.4s linear infinite",
          }}
        />
      ))}
    </div>
  );
}

/**
 * 2026 redesign: collapse the "More with {Plan}" section from a big
 * block on every page into a single discreet pill. The upsell still
 * lives — it just stops being visual noise. Children (the locked
 * cards) are counted but not rendered inline; tapping the pill opens
 * the Plans drawer where they can be browsed properly.
 */
export function MoreWithSection({
  plan,
  title,
  children,
}: {
  plan: Plan;
  title?: string;
  children: ReactNode;
}) {
  // Count the children for the pill caption.
  const items = Children.toArray(children);
  const count = items.length;
  if (count === 0) return null;
  const planLabel = PLAN_META[plan].label;
  const proto = useProto();
  return (
    <div style={{ marginTop: 18, marginBottom: 4, display: "flex", justifyContent: "flex-start" }}>
      <button
        type="button"
        onClick={() => proto.openDrawer("plan-billing")}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "5px 11px",
          borderRadius: 999,
          background: "transparent",
          border: `1px dashed ${COLORS.borderSoft}`,
          color: COLORS.inkMuted,
          fontFamily: FONTS.body,
          fontSize: 11,
          fontWeight: 500,
          textDecoration: "none",
          cursor: "pointer",
          transition: `border-color ${TRANSITION.micro}, color ${TRANSITION.micro}`,
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = COLORS.border;
          (e.currentTarget as HTMLElement).style.color = COLORS.ink;
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.borderColor = COLORS.borderSoft;
          (e.currentTarget as HTMLElement).style.color = COLORS.inkMuted;
        }}
      >
        <span aria-hidden style={{ fontSize: 10 }}>🔒</span>
        {title ?? `${count} more with ${planLabel}`}
        <span aria-hidden style={{ marginLeft: 2, fontSize: 11 }}>→</span>
      </button>
    </div>
  );
}

// ─── Buttons ─────────────────────────────────────────────────────────

export function PrimaryButton({
  onClick,
  children,
  type = "button",
  size = "md",
  disabled,
}: {
  onClick?: () => void;
  children: ReactNode;
  type?: "button" | "submit";
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const sizes: Record<typeof size, CSSProperties> = {
    sm: { padding: "7px 12px", fontSize: 12.5 },
    md: { padding: "9px 16px", fontSize: 13 },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizes[size],
        fontFamily: FONTS.body,
        fontWeight: 500,
        background: COLORS.fill,
        color: "#fff",
        border: "1px solid transparent",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.38 : 1,
        letterSpacing: 0.1,
        transition: `background ${TRANSITION.sm}, transform ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        // Hover deepens the slate. Was "#1d1d20" (near-black) — flagged
        // repeatedly in feedback_admin_aesthetics as too-aggressive.
        if (!disabled) e.currentTarget.style.background = COLORS.fillDeep;
      }}
      onMouseLeave={(e) => {
        // Reset to the slate fill, NOT to COLORS.ink. Earlier this
        // reset to ink (#0B0B0D — pure black) which meant any hover
        // permanently turned the button black across the app.
        e.currentTarget.style.background = COLORS.fill;
        e.currentTarget.style.transform = "scale(1)";
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.98)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  onClick,
  children,
  size = "md",
  disabled,
}: {
  onClick?: () => void;
  children: ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const sizes: Record<typeof size, CSSProperties> = {
    sm: { padding: "7px 12px", fontSize: 12.5 },
    md: { padding: "9px 16px", fontSize: 13 },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizes[size],
        fontFamily: FONTS.body,
        fontWeight: 500,
        background: "#fff",
        color: COLORS.ink,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.38 : 1,
        transition: `border-color ${TRANSITION.sm}, transform ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.borderColor = "rgba(11,11,13,0.28)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.transform = "scale(1)";
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.98)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  onClick,
  children,
  size = "md",
}: {
  onClick?: () => void;
  children: ReactNode;
  size?: "sm" | "md";
}) {
  const sizes: Record<typeof size, CSSProperties> = {
    sm: { padding: "6px 10px", fontSize: 12.5 },
    md: { padding: "8px 12px", fontSize: 13 },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        ...sizes[size],
        fontFamily: FONTS.body,
        fontWeight: 500,
        background: "transparent",
        color: COLORS.inkMuted,
        border: "1px solid transparent",
        borderRadius: 8,
        cursor: "pointer",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = "rgba(11,11,13,0.04)";
        e.currentTarget.style.color = COLORS.ink;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = COLORS.inkMuted;
      }}
    >
      {children}
    </button>
  );
}

// ─── DrawerShell ─────────────────────────────────────────────────────
// Resizable + size-mode-aware. Three preset sizes (compact / half / full)
// switchable from header buttons; a draggable left edge lets users fine-tune.

export type DrawerSize = "compact" | "half" | "full";

const DRAWER_SIZE_PX: Record<DrawerSize, (vw: number) => number> = {
  compact: () => 520,
  half: (vw) => Math.round(vw * 0.5),
  full: (vw) => Math.round(vw * 0.92),
};

export function DrawerShell({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 520,
  defaultSize = "compact",
  resizable = true,
  toolbar,
  canClose = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  defaultSize?: DrawerSize;
  resizable?: boolean;
  /** Optional extra header content (e.g., status chips) shown next to the title. */
  toolbar?: ReactNode;
  /** When false, Esc shows a "save first" warning instead of closing. */
  canClose?: boolean;
}) {
  const [size, setSize] = useState<DrawerSize>(defaultSize);
  const [customWidth, setCustomWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef<HTMLElement | null>(null);
  // WS-12.6 — capture the focused element at the moment the drawer opens
  // so we can return focus to it when the drawer closes (WCAG 2.4.3).
  const returnFocusRef = useRef<HTMLElement | null>(null);
  // Drawer back-stack: when a previous drawer is below in the chain we
  // render a small "← Back" anchor so users can pop instead of close-and-
  // reopen. Pulled directly from context — no per-drawer wiring needed.
  const proto = useProto();
  const previousDrawer = proto.drawerStack[proto.drawerStack.length - 1];
  // WS-2.1 — drawer size toolbar (compact / half / full) is meaningless
  // on phones because the panel auto-clamps to 96vw regardless. Hide
  // it below 768px to recover header space + reduce noise.
  //
  // `useViewport()` returns "desktop" on the server but the actual
  // viewport on the client. Without the `mounted` gate below, server
  // renders the toolbar (desktop) while client renders the close button
  // (phone) → React reports a hydration mismatch and the surrounding
  // Suspense boundary stays stuck in its hidden SSR shell. Gating on
  // `mounted` defers the viewport-dependent render to a post-hydration
  // effect so SSR and first CSR agree.
  const viewport = useViewport();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const showSizeToolbar = mounted && resizable && viewport !== "phone";

  // ── Help panel state ────────────────────────────────────────────
  // Auto-look up the help entry for the currently-open drawer. The
  // ⓘ button only renders when an entry exists. Resets to closed
  // every time the drawer changes.
  const currentDrawerId = proto.state.drawer.drawerId;
  const helpAvailable = hasHelp(currentDrawerId);
  const helpPanelId = useId();
  const [helpOpen, setHelpOpen] = useState(false);
  // Tracks whether the user has ever opened help for this drawer in
  // this session. Drives the small "new" dot on the icon.
  const [helpSeen, setHelpSeen] = useState(() => hasOpenedHelp(currentDrawerId));
  useEffect(() => {
    setHelpOpen(false);
    setHelpSeen(hasOpenedHelp(currentDrawerId));
  }, [currentDrawerId]);
  const toggleHelp = () => {
    const next = !helpOpen;
    setHelpOpen(next);
    if (next && currentDrawerId) {
      markHelpOpened(currentDrawerId);
      setHelpSeen(true);
    }
  };

  // Reset size when drawer reopens (so a fullscreen leftover doesn't bleed in)
  useEffect(() => {
    if (open) {
      setSize(defaultSize);
      setCustomWidth(null);
    }
  }, [open, defaultSize]);

  // WS-12.6 — auto-focus first interactive element when drawer opens (#28),
  // and return focus to the trigger element when it closes (WCAG 2.4.3).
  useEffect(() => {
    if (open) {
      // Capture the element that had focus before the drawer opened.
      returnFocusRef.current = document.activeElement as HTMLElement | null;
      const raf = requestAnimationFrame(() => {
        if (!panelRef.current) return;
        const first = panelRef.current.querySelector<HTMLElement>(
          'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])',
        );
        first?.focus({ preventScroll: true });
      });
      return () => cancelAnimationFrame(raf);
    } else {
      // Drawer just closed — return focus to the trigger.
      const target = returnFocusRef.current;
      if (target && typeof target.focus === "function") {
        requestAnimationFrame(() => target.focus({ preventScroll: true }));
      }
      returnFocusRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (canClose) {
          onClose();
        } else {
          proto.toast("Save your changes first, or click × to discard.");
        }
      }
      // Tab focus trap — keep keyboard focus inside the drawer panel so
      // users don't tab into the surface behind the backdrop.
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) return;
        const first = focusable[0]!;
        const last = focusable[focusable.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [open, onClose, canClose]);

  // "?" key toggles the help panel — separate effect so scroll-lock
  // dependencies stay stable. Skipped when the user is typing in an
  // input/textarea/select.
  useEffect(() => {
    if (!open || !helpAvailable) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "?") return;
      // Don't hijack Cmd+? (macOS Help menu), Ctrl+?, Alt+? — those
      // belong to the browser/OS. Plain Shift+? (the natural way to
      // type "?" on US layouts) is the only modifier we accept.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const isTyping =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (target?.isContentEditable ?? false);
      if (isTyping) return;
      e.preventDefault();
      toggleHelp();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, helpAvailable, toggleHelp]);

  // Drag-to-dismiss on mobile (#14): a right-swipe ≥ 80px from the left
  // edge closes the drawer. Works alongside the existing desktop resize.
  useEffect(() => {
    if (!open || !panelRef.current) return;
    let startX = 0;
    let startY = 0;
    const onTouchStart = (e: TouchEvent) => {
      startX = e.touches[0]!.clientX;
      startY = e.touches[0]!.clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0]!.clientX - startX;
      const dy = Math.abs(e.changedTouches[0]!.clientY - startY);
      if (dx > 80 && dy < 60) onClose();
    };
    const panel = panelRef.current;
    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchend", onTouchEnd);
    };
  }, [open, onClose]);

  // Drag-to-resize from the left edge
  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const next = Math.min(
        Math.max(window.innerWidth - e.clientX, 380),
        Math.round(window.innerWidth * 0.96),
      );
      setCustomWidth(next);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [dragging]);

  // Resolve the actual rendered width
  const resolvedWidth = (() => {
    if (typeof window === "undefined") return width;
    if (customWidth) return customWidth;
    if (size === "compact") return Math.max(width, 380);
    return DRAWER_SIZE_PX[size](window.innerWidth);
  })();

  return (
    <>
      {/* backdrop — kept light so the surface behind stays legible (helps
          orient the user) and so the drawer feels like a layered panel
          rather than a modal takeover. */}
      <div
        onClick={onClose}
        aria-hidden
        data-tulala-drawer-overlay
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(11,11,13,0.28)",
          zIndex: Z.drawerBackdrop,
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity .2s ease",
        }}
      />
      {/* panel */}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-tulala-drawer-panel
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100dvh",
          width: resolvedWidth,
          maxWidth: "96vw",
          background: COLORS.surface,
          borderLeft: `1px solid ${COLORS.border}`,
          zIndex: Z.drawerPanel,
          display: "flex",
          flexDirection: "column",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: dragging
            ? "none"
            : "transform .25s cubic-bezier(.4,.0,.2,1), width .2s cubic-bezier(.4,.0,.2,1)",
          boxShadow: open ? "0 30px 60px -20px rgba(11,11,13,0.45)" : "none",
          paddingRight: "env(safe-area-inset-right, 0px)",
        }}
      >
        {/* drag handle on the left edge */}
        {resizable && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            aria-label="Resize drawer"
            role="separator"
            style={{
              position: "absolute",
              top: 0,
              left: -3,
              width: 6,
              height: "100%",
              cursor: "ew-resize",
              zIndex: 1,
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "rgba(11,11,13,0.06)";
            }}
            onMouseLeave={(e) => {
              if (!dragging) e.currentTarget.style.background = "transparent";
            }}
          />
        )}
        <header
          data-tulala-drawer-header
          style={{
            padding: "16px 22px 14px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
            display: "flex",
            alignItems: "flex-start",
            gap: 14,
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Mobile-only "back" link — sits ABOVE the title so it doesn't
                eat horizontal space. Tiny arrow + muted "Back" label;
                whole drawer is the destination, no need for a big pill. */}
            <button
              type="button"
              onClick={onClose}
              data-tulala-drawer-mobile-back
              aria-label="Close drawer and return to page"
              style={{
                display: "none", // mobile CSS reveals it
                alignItems: "center",
                gap: 3,
                background: "transparent",
                border: "none",
                padding: "0 0 6px",
                cursor: "pointer",
                fontFamily: FONTS.body,
                fontSize: 11.5,
                fontWeight: 500,
                color: COLORS.inkMuted,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                <path d="M10 3L5 8l5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            {previousDrawer && (
              <button
                type="button"
                onClick={proto.popDrawer}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: COLORS.inkMuted,
                  marginBottom: 6,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.ink)}
                onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.inkMuted)}
              >
                <span aria-hidden style={{ fontSize: 12 }}>←</span>
                Back to {drawerIdToLabel(previousDrawer.drawerId)}
              </button>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <h2
                style={{
                  fontFamily: FONTS.display,
                  fontSize: 22,
                  fontWeight: 500,
                  letterSpacing: -0.3,
                  color: COLORS.ink,
                  margin: 0,
                  lineHeight: 1.2,
                }}
              >
                {title}
              </h2>
              {toolbar}
            </div>
            {description && (
              <p
                style={{
                  fontFamily: FONTS.body,
                  fontSize: 13,
                  color: COLORS.inkMuted,
                  margin: "4px 0 0",
                  lineHeight: 1.5,
                }}
              >
                {description}
              </p>
            )}
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
            {/* Auto-rendered "Copy link" button — drawer state is already
                in the URL via ProtoProvider, so this turns every drawer
                into a shareable link with one click. */}
            <Popover content="Copy link to this drawer">
              <button
                type="button"
                aria-label="Copy link to this drawer"
                onClick={() => {
                  if (typeof window === "undefined") return;
                  navigator.clipboard?.writeText(window.location.href);
                  proto.toast("Link copied — anyone with access lands here.");
                }}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 6,
                  border: `1px solid ${COLORS.borderSoft}`,
                  background: "#fff",
                  color: COLORS.inkMuted,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 12,
                  marginRight: 4,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.color = COLORS.ink;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = COLORS.borderSoft;
                  e.currentTarget.style.color = COLORS.inkMuted;
                }}
              >
                <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M10 13a5 5 0 0 0 7.07 0l3.5-3.5a5 5 0 0 0-7.07-7.07l-1 1" />
                  <path d="M14 11a5 5 0 0 0-7.07 0l-3.5 3.5a5 5 0 0 0 7.07 7.07l1-1" />
                </svg>
              </button>
            </Popover>
            {/* Auto-rendered "What is this?" button — only shows when an
                entry exists in the help registry. Pulls drawer id from
                proto state so individual drawer components don't have
                to wire anything. Press "?" to toggle without clicking. */}
            {helpAvailable && (
              <>
                {/* Keyframe for the "unread help" indicator — emitted
                    once per drawer-open here (vs. once per dot render
                    if it lived inside the dot span). The reduced-
                    motion override stops the animation entirely for
                    users who request it; the dot stays visible (just
                    static) so the affordance isn't lost.

                    Also defines the keyboard focus-visible ring on the
                    help button. Inline-style props can't express
                    :focus-visible, so we co-locate the rule here. */}
                <style>{`@keyframes tulalaHelpDotPulse { 0%, 100% { opacity: 0.7; transform: scale(1); } 50% { opacity: 1; transform: scale(1.2); } } @media (prefers-reduced-motion: reduce) { [data-tulala-help-dot] { animation: none !important; } } [data-tulala-help-btn]:focus-visible { outline: 2px solid ${COLORS.brand}; outline-offset: 2px; }`}</style>
              <Popover content={helpOpen ? "Hide help · ?" : "About this view · ?"}>
                <button
                  type="button"
                  data-tulala-help-btn
                  aria-label={title ? `About: ${title}` : "About this view"}
                  aria-controls={helpPanelId}
                  aria-expanded={helpOpen}
                  onClick={toggleHelp}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: `1px solid ${helpOpen ? COLORS.border : COLORS.borderSoft}`,
                    background: helpOpen ? COLORS.accentSoft : "#fff",
                    color: helpOpen ? COLORS.accent : COLORS.inkMuted,
                    cursor: "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    marginRight: 4,
                    position: "relative",
                    transition: `background ${TRANSITION.micro}, color ${TRANSITION.micro}, border-color ${TRANSITION.micro}`,
                  }}
                  onMouseEnter={(e) => {
                    if (!helpOpen) {
                      e.currentTarget.style.borderColor = COLORS.border;
                      e.currentTarget.style.color = COLORS.ink;
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!helpOpen) {
                      e.currentTarget.style.borderColor = COLORS.borderSoft;
                      e.currentTarget.style.color = COLORS.inkMuted;
                    }
                  }}
                >
                  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 16v-4" />
                    <path d="M12 8h.01" />
                  </svg>
                  {/* "Never opened in this session" indicator. Hides
                      the moment the user clicks (markHelpOpened).
                      Pulse runs 5 cycles (~9s) then settles into a
                      steady dot — infinite pulse drains battery and
                      trains people to tune it out. */}
                  {!helpSeen && (
                    <span
                      aria-hidden
                      data-tulala-help-dot
                      style={{
                        position: "absolute",
                        top: 2,
                        right: 2,
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        // Indigo = informational/system signal per the
                        // semantic color memo. Coral is reserved for
                        // "your move" actions and would dilute that
                        // signal if we used it for "unread help".
                        background: COLORS.indigo,
                        boxShadow: "0 0 0 2px #fff",
                        animation: "tulalaHelpDotPulse 1.8s ease-in-out 5",
                        animationFillMode: "both",
                        transformOrigin: "center",
                      }}
                    />
                  )}
                </button>
              </Popover>
              </>
            )}
            {showSizeToolbar && (
              <div
                data-tulala-drawer-size-toolbar
                style={{
                  display: "inline-flex",
                  background: "rgba(11,11,13,0.04)",
                  borderRadius: 8,
                  padding: 2,
                  marginRight: 6,
                }}
              >
                {(["compact", "half", "full"] as DrawerSize[]).map((s) => {
                  const active = (customWidth === null && size === s);
                  const tip =
                    s === "compact"
                      ? "Side drawer"
                      : s === "half"
                        ? "Half-page"
                        : "Full-page";
                  return (
                    <Popover key={s} content={tip}>
                      <button
                        onClick={() => {
                          setCustomWidth(null);
                          setSize(s);
                        }}
                        aria-label={`${s} size`}
                        style={{
                          background: active ? "#fff" : "transparent",
                          boxShadow: active
                            ? "0 1px 3px rgba(11,11,13,0.10)"
                            : "none",
                          border: "none",
                          padding: "5px 8px",
                          borderRadius: 6,
                          cursor: "pointer",
                          color: active ? COLORS.ink : COLORS.inkMuted,
                          display: "inline-flex",
                          alignItems: "center",
                        }}
                      >
                        <SizeIcon variant={s} />
                      </button>
                    </Popover>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close ${title}`}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: `1px solid ${COLORS.borderSoft}`,
                background: "#fff",
                color: COLORS.inkMuted,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = COLORS.border;
                e.currentTarget.style.color = COLORS.ink;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = COLORS.borderSoft;
                e.currentTarget.style.color = COLORS.inkMuted;
              }}
            >
              <Icon name="x" size={14} stroke={1.8} />
            </button>
          </div>
        </header>
        {/* Slide-down help panel — only renders when an entry exists in
            the registry (helpAvailable gates the toolbar button). Lives
            outside the scrollable body so it doesn't push the form off-
            screen but stays attached to the header. */}
        <HelpPanel
          drawerId={currentDrawerId}
          open={helpOpen}
          panelId={helpPanelId}
          onJumpTo={(id) => {
            setHelpOpen(false);
            proto.openDrawer(id);
          }}
        />
        <div
          data-tulala-drawer-body
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px 22px 24px",
          }}
        >
          {children}
        </div>
        {footer && (
          <footer
            data-tulala-drawer-footer
            style={{
              padding: "14px 22px",
              paddingBottom: "calc(14px + env(safe-area-inset-bottom, 0px))",
              borderTop: `1px solid ${COLORS.borderSoft}`,
              background: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: 8,
            }}
          >
            {footer}
          </footer>
        )}
      </aside>
    </>
  );
}

function SizeIcon({ variant }: { variant: DrawerSize }) {
  // Each variant fills a different proportion of the right side of the
  // viewport rectangle — readable at a glance even at 14px. The empty
  // rectangle is the page; the filled portion is where the drawer lands.
  const common = {
    width: 14,
    height: 14,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
  } as const;
  if (variant === "compact") {
    return (
      <svg {...common}>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <rect x="11" y="3.5" width="2.5" height="9" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (variant === "half") {
    return (
      <svg {...common}>
        <rect x="2" y="3" width="12" height="10" rx="1.5" />
        <rect x="8" y="3.5" width="5.5" height="9" rx="0.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  // full
  return (
    <svg {...common}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <rect x="3.5" y="4" width="9" height="8" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

// ─── ModalShell ──────────────────────────────────────────────────────

export function ModalShell({
  open,
  onClose,
  children,
  width = 540,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    lockScroll();
    return () => {
      window.removeEventListener("keydown", onKey);
      unlockScroll();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      onClick={onClose}
      data-tulala-modal-overlay
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,11,13,0.36)",
        zIndex: Z.modalBackdrop,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        style={{
          width,
          maxWidth: "96vw",
          maxHeight: "92dvh",
          background: COLORS.card,
          borderRadius: 16,
          boxShadow: "0 30px 80px -20px rgba(11,11,13,0.5)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {children}
      </div>
    </div>
  );
}

// ─── Field group / row helpers (shared by drawers) ───────────────────

export function FieldRow({
  label,
  children,
  hint,
  optional,
  required,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  optional?: boolean;
  /** Marks the field as required with a small red asterisk after the label. */
  required?: boolean;
  /** Inline error message — replaces hint and tints the row red. */
  error?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <label
          style={{
            fontFamily: FONTS.body,
            fontSize: 12,
            fontWeight: 500,
            color: COLORS.ink,
            letterSpacing: 0.1,
          }}
        >
          {label}
          {required && (
            <span
              aria-label="required"
              style={{
                color: COLORS.red,
                marginLeft: 3,
                fontWeight: 600,
              }}
            >
              *
            </span>
          )}
        </label>
        {optional && (
          <span
            style={{
              fontFamily: FONTS.body,
              fontSize: 11,
              color: COLORS.inkDim,
            }}
          >
            Optional
          </span>
        )}
      </div>
      {children}
      {error ? (
        <>
          <style>{`@keyframes tulalaFieldError { from { opacity: 0; transform: translateY(-2px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <span
            role="alert"
            style={{
              fontFamily: FONTS.body,
              fontSize: 11.5,
              color: COLORS.red,
              fontWeight: 500,
              animation: "tulalaFieldError .18s ease",
            }}
          >
            {error}
          </span>
        </>
      ) : hint ? (
        <span
          style={{
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: COLORS.inkMuted,
          }}
        >
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function TextInput({
  defaultValue,
  value,
  onChange,
  placeholder,
  prefix,
  suffix,
  type = "text",
  autoFocus,
  readOnly,
  error,
  maxLength,
}: {
  defaultValue?: string;
  /** Controlled value. If provided, pair with `onChange`. */
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  prefix?: ReactNode;
  suffix?: ReactNode;
  type?: "text" | "email" | "url";
  autoFocus?: boolean;
  readOnly?: boolean;
  /** Marks the input invalid — red border + background tint. Pair with FieldRow `error` for the message. */
  error?: boolean;
  maxLength?: number;
}) {
  const [focused, setFocused] = useState(false);
  const descId = useId();
  const currentLen = value?.length ?? 0;
  const showCount = maxLength !== undefined && currentLen >= Math.floor(maxLength * 0.75);
  const borderColor = error ? COLORS.red : focused ? COLORS.inkDim : COLORS.border;
  const shadow = error
    ? (focused ? "0 0 0 3px rgba(200,40,40,0.15)" : "none")
    : (focused ? "0 0 0 3px rgba(11,11,13,0.08)" : "none");
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        background: error ? "rgba(200,40,40,0.04)" : "#fff",
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        overflow: "hidden",
        minHeight: 44,
        boxShadow: shadow,
        transition: `border-color ${TRANSITION.sm}, box-shadow ${TRANSITION.sm}`,
      }}
    >
      {prefix && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 10px",
            background: "rgba(11,11,13,0.03)",
            borderRight: `1px solid ${COLORS.borderSoft}`,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
          }}
        >
          {prefix}
        </span>
      )}
      <input
        type={type}
        inputMode={type === "email" ? "email" : undefined}
        autoComplete={type === "email" ? "email" : undefined}
        defaultValue={value === undefined ? defaultValue : undefined}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoFocus={autoFocus}
        readOnly={readOnly}
        maxLength={maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={showCount ? descId : undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={{
          flex: 1,
          padding: "9px 12px",
          fontFamily: FONTS.body,
          fontSize: 13.5,
          color: COLORS.ink,
          background: "transparent",
          border: "none",
          outline: "none",
          minHeight: 42,
        }}
      />
      {showCount && maxLength && (
        <span
          id={descId}
          aria-live="polite"
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 10px",
            fontFamily: FONTS.body,
            fontSize: 11,
            color: currentLen >= maxLength ? COLORS.red : COLORS.inkMuted,
            flexShrink: 0,
          }}
        >
          {currentLen}/{maxLength}
        </span>
      )}
      {suffix && !showCount && (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "0 10px",
            background: "rgba(11,11,13,0.03)",
            borderLeft: `1px solid ${COLORS.borderSoft}`,
            fontFamily: FONTS.body,
            fontSize: 12.5,
            color: COLORS.inkMuted,
          }}
        >
          {suffix}
        </span>
      )}
    </div>
  );
}

export function TextArea({
  defaultValue,
  value,
  onChange,
  placeholder,
  rows = 4,
  error,
}: {
  defaultValue?: string;
  /** Controlled value. Pair with onChange when supplied. */
  value?: string;
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  rows?: number;
  /** Marks the textarea invalid — red border + tint. Pair with FieldRow `error`. */
  error?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? COLORS.red : focused ? COLORS.inkDim : COLORS.border;
  const shadow = error
    ? (focused ? "0 0 0 3px rgba(200,40,40,0.15)" : "none")
    : (focused ? "0 0 0 3px rgba(11,11,13,0.08)" : "none");
  return (
    <textarea
      defaultValue={value === undefined ? defaultValue : undefined}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      rows={rows}
      aria-invalid={error ? true : undefined}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        padding: "9px 12px",
        fontFamily: FONTS.body,
        fontSize: 13.5,
        color: COLORS.ink,
        background: error ? "rgba(200,40,40,0.04)" : "#fff",
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        outline: "none",
        resize: "vertical",
        lineHeight: 1.55,
        boxShadow: shadow,
        transition: `border-color ${TRANSITION.sm}, box-shadow ${TRANSITION.sm}`,
      }}
    />
  );
}

export function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange?: (v: boolean) => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange?.(!on)}
      role="switch"
      aria-checked={on}
      aria-label={label ?? "Toggle switch"}
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 999,
        background: on ? COLORS.fill : "rgba(11,11,13,0.16)",
        border: "none",
        cursor: "pointer",
        padding: 0,
        flexShrink: 0,
        transition: `background ${TRANSITION.sm}`,
      }}
    >
      <span
        style={{
          position: "absolute",
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left .15s",
          boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
        }}
      />
    </button>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) {
    return (
      <div
        role="separator"
        aria-orientation="horizontal"
        style={{
          height: 1,
          background: COLORS.borderSoft,
          margin: "16px 0",
        }}
      />
    );
  }
  return (
    <div
      role="separator"
      aria-label={label}
      data-tulala-divider-labelled
      style={{
        display: "flex",
        alignItems: "baseline",
        gap: 8,
        margin: "16px 0 8px",
      }}
    >
      <h2 style={{
        margin: 0, fontFamily: FONTS.body, fontSize: 13, fontWeight: 600,
        color: COLORS.ink, letterSpacing: -0.05,
      }}>{label}</h2>
      <div aria-hidden style={{ flex: 1, height: 1, background: COLORS.borderSoft }} />
      <style>{`
        @media (max-width: 540px) {
          [data-tulala-divider-labelled] { margin: 12px 0 6px !important; }
        }
      `}</style>
    </div>
  );
}

// ─── Toast host ──────────────────────────────────────────────────────
//
// WS-6.1: Extended tone system.
//   "default"  — dark/ink (generic success-ish)
//   "success"  — dark green + check-circle
//   "error"    — dark red + alert
//   "warning"  — dark amber + alert
//   "info"     — dark blue + info
//
// All tones share the same component; only background, shadow, icon,
// and progress-bar colour change.

export type ToastTone = "default" | "success" | "error" | "warning" | "info";

const TOAST_LIFETIME_MS = 4500;

const TOAST_THEME: Record<ToastTone, { bg: string; shadow: string; iconName: string; progressBg: string }> = {
  default: {
    bg:          COLORS.fill,
    shadow:      "0 12px 30px -10px rgba(11,11,13,0.5)",
    iconName:    "check",
    progressBg:  "rgba(255,255,255,0.25)",
  },
  success: {
    bg:          "#14462e",
    shadow:      "0 12px 30px -10px rgba(20,70,46,0.55)",
    iconName:    "check",
    progressBg:  "rgba(52,211,153,0.45)",
  },
  error: {
    bg:          "#5a1a1f",
    shadow:      "0 12px 30px -10px rgba(120,30,40,0.55)",
    iconName:    "alert",
    progressBg:  "rgba(252,165,165,0.4)",
  },
  warning: {
    bg:          "#5c3a00",
    shadow:      "0 12px 30px -10px rgba(92,58,0,0.55)",
    iconName:    "alert",
    progressBg:  "rgba(253,224,71,0.4)",
  },
  info: {
    bg:          "#0f2a4a",
    shadow:      "0 12px 30px -10px rgba(15,42,74,0.55)",
    iconName:    "info",
    progressBg:  "rgba(147,197,253,0.4)",
  },
};

/**
 * Per-toast row — owns its own auto-dismiss timer. Hover pauses the timer
 * (so reading a long-ish toast doesn't get interrupted), mouseleave
 * resumes from a fresh full window. Click dismisses immediately.
 */
type ToastAction = { label: string; onClick: () => void };
function ToastRow({ id, message, undo, action, tone = "default", onDismiss }: { id: number; message: string; undo?: () => void; action?: ToastAction; tone?: ToastTone; onDismiss?: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  const theme   = TOAST_THEME[tone];
  const lifetime = (undo || action) ? TOAST_LIFETIME_MS * 2 : TOAST_LIFETIME_MS;
  useEffect(() => {
    if (!onDismiss || paused) return;
    const handle = window.setTimeout(() => onDismiss(id), lifetime);
    return () => window.clearTimeout(handle);
  }, [id, onDismiss, paused, undo, action, lifetime]);
  return (
    <div
      // WS-12.7 — error toasts use role="alert" (assertive) so screen readers
      // announce them immediately; other tones use role="status" (polite).
      role={tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      style={{
        background:    theme.bg,
        color:         "#fff",
        padding:       "10px 14px 0",
        borderRadius:  10,
        fontFamily:    FONTS.body,
        fontSize:      13,
        boxShadow:     theme.shadow,
        display:       "inline-flex",
        flexDirection: "column",
        gap:           0,
        animation:     "tulalaToastIn .18s ease",
        pointerEvents: "auto",
        textAlign:     "left",
        overflow:      "hidden",
        minWidth:      220,
        maxWidth:      360,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, paddingBottom: 10 }}>
        <Icon name={theme.iconName as Parameters<typeof Icon>[0]["name"]} size={14} stroke={2} />
        <span style={{ flex: 1 }}>{message}</span>
        {undo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              undo();
              onDismiss?.(id);
            }}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            style={{
              background: "rgba(255,255,255,0.15)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "4px 10px",
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              marginLeft: 4,
              flexShrink: 0,
            }}
          >
            Undo
          </button>
        )}
        {action && !undo && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
              onDismiss?.(id);
            }}
            onFocus={() => setPaused(true)}
            onBlur={() => setPaused(false)}
            style={{
              background: "rgba(255,255,255,0.2)",
              color: "#fff",
              border: "none",
              borderRadius: 6,
              padding: "4px 10px",
              fontFamily: FONTS.body,
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
              marginLeft: 4,
              flexShrink: 0,
            }}
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          onClick={() => onDismiss?.(id)}
          aria-label={`Dismiss: ${message}`}
          style={{
            background:  "transparent",
            color:       "rgba(255,255,255,0.6)",
            border:      "none",
            padding:     0,
            marginLeft:  (undo || action) ? 0 : "auto",
            cursor:      "pointer",
            display:     "inline-flex",
            flexShrink:  0,
          }}
        >
          <Icon name="x" size={11} stroke={2} />
        </button>
      </div>
      {/* Progress bar — shrinks from 100% to 0 over the toast lifetime */}
      <div
        aria-hidden
        style={{
          height:          2,
          background:      theme.progressBg,
          borderRadius:    999,
          width:           "100%",
          transformOrigin: "left",
          animation:       `tulalaToastProgress ${lifetime}ms linear forwards`,
          animationPlayState: paused ? "paused" : "running",
        }}
      />
    </div>
  );
}

export function ToastHost({
  toasts,
  onDismiss,
}: {
  toasts: { id: number; message: string; undo?: () => void; action?: ToastAction; tone?: ToastTone }[];
  onDismiss?: (id: number) => void;
}) {
  return (
    <div
      // Status-region announcements: each new toast is read by screen readers
      // without stealing focus. `polite` defers until the user is idle so we
      // don't interrupt active typing.
      role="status"
      aria-live="polite"
      aria-atomic="false"
      aria-relevant="additions text"
      data-tulala-toast-host
      style={{
        position: "fixed",
        bottom: 20,
        right: 20,
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: Z.toast,
        // Allow clicks on individual toasts; the wrapper itself stays
        // pass-through so it never blocks UI underneath.
        pointerEvents: "none",
      }}
    >
      {toasts.map((t) => (
        <ToastRow key={t.id} id={t.id} message={t.message} undo={t.undo} action={t.action} tone={t.tone} onDismiss={onDismiss} />
      ))}
      <style>{`
        @keyframes tulalaToastIn {
          from { transform: translateY(8px); opacity: 0; }
          to   { transform: translateY(0); opacity: 1; }
        }
        @keyframes tulalaToastProgress {
          from { transform: scaleX(1); }
          to   { transform: scaleX(0); }
        }
      `}</style>
    </div>
  );
}

// ─── Avatar ──────────────────────────────────────────────────────────
//
// Real-photo seed: 20+ named talents/coordinators get a stable Pravatar
// URL keyed off their full name. When `Avatar` is rendered with a
// `hashSeed` (the convention everywhere — full name as seed), it
// auto-resolves to a real photo. Falls back to the existing initials +
// hashed-tone behavior for anyone unknown.
//
// Why Pravatar: free, deterministic, no API key, sized at 300px square,
// served via CDN. Stable img IDs mean the same name always gets the same
// face — important for QA so the user can tell people apart visually.
const PHOTO_BY_NAME: Record<string, string> = {
  // Talent (women)
  "Marta Reyes":        "https://i.pravatar.cc/300?img=5",
  "Lina Park":          "https://i.pravatar.cc/300?img=9",
  "Zara Habib":         "https://i.pravatar.cc/300?img=10",
  "Zara Hadid":         "https://i.pravatar.cc/300?img=10",
  "Iris Volpe":         "https://i.pravatar.cc/300?img=16",
  "Ana Vega":           "https://i.pravatar.cc/300?img=20",
  "Joana Rivera":       "https://i.pravatar.cc/300?img=23",
  "Joana R.":           "https://i.pravatar.cc/300?img=23",
  "Sara Bianchi":       "https://i.pravatar.cc/300?img=25",
  "Sara Mendez":        "https://i.pravatar.cc/300?img=26",
  "Sara M.":            "https://i.pravatar.cc/300?img=26",
  "Francesca Bianchi":  "https://i.pravatar.cc/300?img=29",
  "Elena Lombardi":     "https://i.pravatar.cc/300?img=32",
  // Talent (men)
  "Tomás Navarro":      "https://i.pravatar.cc/300?img=12",
  "Tomás Núñez":        "https://i.pravatar.cc/300?img=12",
  "Kai Lin":            "https://i.pravatar.cc/300?img=14",
  "Mario Rossi":        "https://i.pravatar.cc/300?img=33",
  "Aaron Park":         "https://i.pravatar.cc/300?img=51",
  "Daniel Ferrer":      "https://i.pravatar.cc/300?img=52",
  "Marco Pellegrini":   "https://i.pravatar.cc/300?img=60",
  "Oran Tene":          "https://i.pravatar.cc/300?img=11",
  "Orant Tenes":        "https://i.pravatar.cc/300?img=11",
};
function photoForName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  // Try exact then a normalized lookup (drop trailing punctuation, etc.).
  return PHOTO_BY_NAME[name] ?? PHOTO_BY_NAME[name.replace(/[.,]+$/g, "")];
}

export function Avatar({
  initials,
  size = 32,
  emoji,
  tone = "neutral",
  photoUrl,
  hashSeed,
}: {
  initials?: string;
  size?: number;
  emoji?: string;
  tone?: "neutral" | "ink" | "warm" | "auto";
  /** When provided wins over initials/emoji — actual photo. */
  photoUrl?: string;
  /**
   * String to hash for `tone="auto"`. Pass the full name (not just
   * initials) — initials collide far too often (TM vs TM is the same;
   * "Tom Marsh" vs "Talia Mendez" should pick different tints).
   */
  hashSeed?: string;
}) {
  // Avatar fallback hierarchy:
  //   1. Photo (when photoUrl given) — for real people
  //   2. Initials with deterministic tint per name — also for real people
  //   3. Emoji — only for non-person entities (brand, hub, system)
  // tone="auto" hashes the seed (full name, ideally) to pick a quiet
  // color. Forest-leaning, no warm gold/rust. Six tones to spread
  // collisions wider than the previous five.
  const autoTones: CSSProperties[] = [
    { background: "rgba(15,79,62,0.10)", color: COLORS.accentDeep },
    { background: "rgba(11,11,13,0.06)", color: COLORS.ink },
    { background: "rgba(46,125,91,0.10)", color: "#1F5C42" },
    { background: "rgba(82,96,109,0.10)", color: "#3A4651" },
    { background: COLORS.surfaceAlt, color: COLORS.ink },
    { background: "rgba(124,108,160,0.10)", color: "#4B3F66" },
    { background: "rgba(180,100,60,0.09)", color: "#7A3D1A" },
    { background: "rgba(40,100,160,0.09)", color: "#1A4A78" },
  ];
  const tones: Record<Exclude<typeof tone, "auto">, CSSProperties> = {
    neutral: { background: "rgba(11,11,13,0.06)", color: COLORS.ink },
    ink: { background: COLORS.fill, color: "#fff" },
    warm: { background: COLORS.surfaceAlt, color: COLORS.ink },
  };
  const resolved =
    tone === "auto"
      ? autoTones[hashString(hashSeed ?? initials ?? emoji ?? "x") % autoTones.length]!
      : tones[tone];
  // Auto-resolve a real photo from the prototype's name registry when
  // the caller used `hashSeed=<full name>` (the convention everywhere).
  // This lets every existing Avatar caller pick up real faces with
  // zero per-call changes.
  const resolvedPhoto = photoUrl ?? photoForName(hashSeed);
  if (resolvedPhoto) {
    return (
      <span
        aria-hidden
        style={{
          // display: inline-block — without this, span collapses to 0x0
          // because <span> is inline by default, which ignores width/height.
          // Was rendering empty rings everywhere a photo was supplied.
          display: "inline-block",
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundImage: `url(${resolvedPhoto})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: COLORS.surfaceAlt,
          flexShrink: 0,
        }}
      />
    );
  }
  return (
    <span
      style={{
        ...resolved,
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONTS.body,
        fontSize: Math.round(size * 0.46),
        fontWeight: 600,
        letterSpacing: 0.3,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {emoji ?? initials}
    </span>
  );
}

/**
 * Map a DrawerId to a human-readable label for the breadcrumb. Exhaustive
 * lookup is overkill given there are ~150 ids — instead we humanize the
 * id by replacing dashes with spaces and falling back to the id itself.
 */
function drawerIdToLabel(id: string | null): string {
  if (!id) return "previous";
  return id
    .split("-")
    .map((part, i) => (i === 0 ? part.charAt(0).toUpperCase() + part.slice(1) : part))
    .join(" ");
}

// djb2 hash. Tiny + deterministic — fine for choosing a tint.
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return Math.abs(h);
}

// ─── SwipeableRow ────────────────────────────────────────────────────
/**
 * Mobile list row with hidden left and/or right action panels that
 * reveal as the user swipes the row horizontally.
 *
 * Implementation notes:
 *  - Pointer events (touch + mouse) so it works in dev too.
 *  - Threshold gates: actions latch open at ~50% of action-panel width;
 *    otherwise the row springs back.
 *  - On click of an action button, the row is reset.
 *  - `pointerEvents` are pass-through when not engaged so links inside
 *    the row keep working on tap-without-drag.
 */
export function SwipeableRow({
  children,
  leftActions,
  rightActions,
}: {
  children: ReactNode;
  /** Revealed when user swipes right. Each gets a fixed width tile. */
  leftActions?: { label: string; onClick: () => void; tone?: "ink" | "red" | "green" }[];
  rightActions?: { label: string; onClick: () => void; tone?: "ink" | "red" | "green" }[];
}) {
  const [dx, setDx] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const startX = useRef<number | null>(null);
  const startDx = useRef(0);
  const allActions = [...(leftActions ?? []), ...(rightActions ?? [])];
  const ACTION_WIDTH = 80;
  const leftMax = (leftActions?.length ?? 0) * ACTION_WIDTH;
  const rightMax = (rightActions?.length ?? 0) * ACTION_WIDTH;

  const onPointerDown = (e: React.PointerEvent) => {
    startX.current = e.clientX;
    startDx.current = dx;
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (startX.current === null) return;
    const delta = e.clientX - startX.current;
    let next = startDx.current + delta;
    next = Math.max(-rightMax, Math.min(leftMax, next));
    setDx(next);
  };
  const onPointerUp = () => {
    startX.current = null;
    // Snap to fully open (one direction) or closed
    if (dx > leftMax / 2) setDx(leftMax);
    else if (dx < -rightMax / 2) setDx(-rightMax);
    else setDx(0);
  };

  const toneColor = (tone?: "ink" | "red" | "green") =>
    tone === "red" ? COLORS.red : tone === "green" ? COLORS.green : COLORS.ink;

  return (
    <div
      style={{
        position: "relative",
        overflow: "hidden",
        touchAction: "pan-y",
      }}
    >
      {/* Left action panel — sits behind the row, revealed when dx > 0 */}
      {leftActions && leftActions.length > 0 && (
        <div
          aria-hidden={dx <= 0}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "flex-start",
            pointerEvents: dx > 0 ? "auto" : "none",
          }}
        >
          {leftActions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                a.onClick();
                setDx(0);
              }}
              style={{
                width: ACTION_WIDTH,
                background: toneColor(a.tone),
                color: "#fff",
                border: "none",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {/* Right action panel */}
      {rightActions && rightActions.length > 0 && (
        <div
          aria-hidden={dx >= 0}
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            justifyContent: "flex-end",
            pointerEvents: dx < 0 ? "auto" : "none",
          }}
        >
          {rightActions.map((a, i) => (
            <button
              key={i}
              type="button"
              onClick={() => {
                a.onClick();
                setDx(0);
              }}
              style={{
                width: ACTION_WIDTH,
                background: toneColor(a.tone),
                color: "#fff",
                border: "none",
                fontFamily: FONTS.body,
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
      {/* Row — translates with the drag */}
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          background: COLORS.card,
          transform: `translateX(${dx}px)`,
          transition: startX.current === null ? "transform .2s ease" : "none",
          willChange: "transform",
          position: "relative",
        }}
      >
        {children}
        {/* Keyboard / accessibility fallback: a kebab "..." button that
            opens a small popover listing the same actions. Keyboard
            users can't drag, so without this all actions were
            mouse/touch-only. */}
        {allActions.length > 0 && (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen((o) => !o);
              }}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Row actions"
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                width: 26,
                height: 26,
                borderRadius: 6,
                border: "none",
                background: "transparent",
                color: COLORS.inkDim,
                cursor: "pointer",
                fontSize: 14,
                fontWeight: 700,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(11,11,13,0.05)";
                e.currentTarget.style.color = COLORS.ink;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = COLORS.inkDim;
              }}
            >
              ⋯
            </button>
            {menuOpen && (
              <div
                role="menu"
                onBlur={() => setMenuOpen(false)}
                style={{
                  position: "absolute",
                  top: 36,
                  right: 6,
                  background: "#fff",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  boxShadow: "0 8px 24px rgba(11,11,13,0.10)",
                  minWidth: 140,
                  padding: 4,
                  zIndex: 5,
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                {allActions.map((a, i) => (
                  <button
                    key={i}
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      a.onClick();
                      setMenuOpen(false);
                    }}
                    style={{
                      background: "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      fontSize: 13,
                      color:
                        a.tone === "red"
                          ? COLORS.red
                          : a.tone === "green"
                            ? COLORS.green
                            : COLORS.ink,
                      padding: "8px 10px",
                      borderRadius: 6,
                      textAlign: "left",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(11,11,13,0.04)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── BackToTop ───────────────────────────────────────────────────────
/**
 * Floating "↑ Top" pill that appears after the user has scrolled past
 * the threshold. Click → smooth-scrolls to the top. Mounted once at the
 * page root; works for any long surface.
 */
export function BackToTop({ threshold = 600 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > threshold);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  if (!visible) return null;
  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: scrollBehavior() })}
      aria-label="Scroll to top"
      style={{
        position: "fixed",
        bottom: "calc(80px + env(safe-area-inset-bottom, 0px))",
        right: 20,
        width: 40,
        height: 40,
        borderRadius: "50%",
        background: COLORS.fill,
        color: "#fff",
        border: "none",
        boxShadow: "0 4px 12px rgba(11,11,13,0.18)",
        cursor: "pointer",
        zIndex: Z.toast - 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 14,
        opacity: 0.9,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
      onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.9")}
    >
      ↑
    </button>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────
/**
 * Loading-state placeholder. A muted block with a shimmering gradient.
 * Use any time we mount a real-data list/card before the data arrives,
 * so the layout doesn't pop and dimensions stay stable. Inherits height
 * + width from props or sets a sensible default.
 */
export function Skeleton({
  width,
  height = 16,
  radius = 6,
  style,
}: {
  width?: number | string;
  height?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <span
      aria-hidden
      style={{
        display: "inline-block",
        width: width ?? "100%",
        height,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, rgba(11,11,13,0.04) 25%, rgba(11,11,13,0.08) 50%, rgba(11,11,13,0.04) 75%)",
        backgroundSize: "200% 100%",
        animation: "tulalaSkeleton 1.4s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

// ─── KeyboardListNav ─────────────────────────────────────────────────
/**
 * j/k-style row navigation hook for list pages. Hooks into a ref of
 * focusable row elements; j/Down moves selection forward, k/Up backward,
 * Enter activates. Skips when focus is in a text input so typing isn't
 * hijacked.
 *
 * Pattern: each row in the list gets ref={(el) => rowsRef.current[i] = el}
 * plus a tabindex / data-attr. The hook listens at window level and
 * focuses+highlights rows on key.
 */
export function useKeyboardListNav<T extends HTMLElement = HTMLElement>({
  rows,
  onActivate,
}: {
  rows: (T | null)[];
  onActivate?: (index: number) => void;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const live = rows.filter((r): r is T => r !== null);
      if (live.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => {
          const next = Math.min(i + 1, live.length - 1);
          live[next]?.focus();
          return next;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => {
          const next = Math.max(i - 1, 0);
          live[next]?.focus();
          return next;
        });
      } else if (e.key === "Enter") {
        if (onActivate) {
          e.preventDefault();
          onActivate(activeIdx);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, onActivate, activeIdx]);
  return activeIdx;
}

// ─── useRovingTabindex ───────────────────────────────────────────────
/**
 * WS-12.6 — Roving-tabindex pattern for navigation lists and tab bars.
 * Only ONE item has tabIndex=0 at a time; arrow keys move focus within
 * the group; Tab exits the group entirely. This matches the ARIA
 * Authoring Practices for "Toolbar" and "Navigation" composite widgets.
 *
 * Usage:
 *   const containerRef = useRef<HTMLElement>(null);
 *   useRovingTabindex(containerRef, '[data-nav-item]');
 *
 * The hook wires keydown handlers on the container element itself
 * (not window) so it only fires when the nav group has focus.
 */
export function useRovingTabindex(
  containerRef: React.RefObject<HTMLElement | null>,
  itemSelector = "button, a[href], [role='tab']",
  { orientation = "vertical" }: { orientation?: "horizontal" | "vertical" } = {},
) {
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Initialise: direct roving items — must be inside this container,
    // not nested inside a child sub-list, and not disabled.
    const getItems = () =>
      Array.from(el.querySelectorAll<HTMLElement>(itemSelector)).filter(
        (item) => !item.hasAttribute("disabled"),
      );

    const init = () => {
      const items = getItems();
      items.forEach((item, i) => {
        item.setAttribute("tabindex", i === 0 ? "0" : "-1");
      });
    };
    init();

    const onKey = (e: KeyboardEvent) => {
      const prev = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
      const next = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
      if (e.key !== prev && e.key !== next && e.key !== "Home" && e.key !== "End") return;

      const items = getItems();
      if (items.length === 0) return;
      const active = document.activeElement as HTMLElement | null;
      const idx = active ? items.indexOf(active) : -1;
      if (idx === -1) return;

      e.preventDefault();
      let target = idx;
      if (e.key === next) target = Math.min(idx + 1, items.length - 1);
      else if (e.key === prev) target = Math.max(idx - 1, 0);
      else if (e.key === "Home") target = 0;
      else if (e.key === "End") target = items.length - 1;

      items.forEach((item, i) => item.setAttribute("tabindex", i === target ? "0" : "-1"));
      items[target]?.focus({ preventScroll: true });
    };

    el.addEventListener("keydown", onKey);
    // Re-init when items are added/removed (e.g. plan gates change visible items)
    const observer = new MutationObserver(init);
    observer.observe(el, { childList: true, subtree: true, attributes: true, attributeFilter: ["disabled"] });
    return () => {
      el.removeEventListener("keydown", onKey);
      observer.disconnect();
    };
  }, [containerRef, itemSelector, orientation]);
}

// ─── BulkSelect ──────────────────────────────────────────────────────
/**
 * Sticky multi-select toolbar that shows when one or more list rows
 * are selected. Drop a row checkbox into each list item via the small
 * <BulkRowCheckbox> primitive, manage a Set<string> of selected ids in
 * the parent, and render <BulkSelectBar> at the top of the page.
 *
 * Pattern is intentionally generic — actions are a per-list concern;
 * this primitive only handles "show the bar when N selected" + "clear".
 */
export function BulkSelectBar({
  count,
  onClear,
  actions,
}: {
  count: number;
  onClear: () => void;
  actions: { label: string; onClick: () => void; tone?: "ink" | "red" }[];
}) {
  if (count === 0) return null;
  return (
    <div
      data-tulala-row
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 14px",
        background: COLORS.fill,
        color: "#fff",
        borderRadius: 10,
        marginBottom: 12,
        fontFamily: FONTS.body,
      }}
    >
      <span style={{ fontSize: 13, fontWeight: 500 }}>
        {count} selected
      </span>
      <button
        type="button"
        onClick={onClear}
        style={{
          background: "transparent",
          border: "none",
          color: "rgba(255,255,255,0.65)",
          fontFamily: FONTS.body,
          fontSize: 12,
          cursor: "pointer",
          padding: 0,
        }}
      >
        Clear
      </button>
      <span style={{ flex: 1 }} />
      {actions.map((a, i) => (
        <button
          key={i}
          type="button"
          onClick={a.onClick}
          style={{
            background: a.tone === "red" ? COLORS.red : "rgba(255,255,255,0.10)",
            color: "#fff",
            border: "none",
            borderRadius: 7,
            padding: "6px 12px",
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}

export function BulkRowCheckbox({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      aria-checked={checked}
      role="checkbox"
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        border: `1.5px solid ${checked ? COLORS.accent : COLORS.borderStrong}`,
        background: checked ? COLORS.fill : "transparent",
        color: "#fff",
        cursor: "pointer",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        padding: 0,
      }}
    >
      {checked && <Icon name="check" size={11} stroke={2.4} color="#fff" />}
    </button>
  );
}

// ─── Popover ─────────────────────────────────────────────────────────
/**
 * Hover/focus-triggered popover with a 200ms open delay (vs. the 700ms
 * browser-native title=). Used for richer tooltips on chips, badges,
 * status icons, drawer toolbar buttons, anywhere we previously relied on
 * `title=` for explanations.
 *
 * Pattern: wrap a single trigger child. Children render normally; a
 * floating panel appears above (or below if no room) on hover/focus.
 *
 * Keyboard: focus opens, blur closes, Escape closes.
 */
export function Popover({
  children,
  content,
  placement = "top",
  delayMs = 200,
}: {
  children: ReactNode;
  content: ReactNode;
  placement?: "top" | "bottom";
  delayMs?: number;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const timerRef = useRef<number | null>(null);

  const measureAndOpen = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const vw = typeof window !== "undefined" ? window.innerWidth : 9999;
    const rawX = rect.left + rect.width / 2;
    const clampedX = Math.max(148, Math.min(vw - 148, rawX));
    setCoords({
      x: clampedX,
      y: placement === "top" ? rect.top : rect.bottom,
    });
    setOpen(true);
  };
  const scheduleOpen = () => {
    if (timerRef.current !== null) return;
    timerRef.current = window.setTimeout(() => {
      measureAndOpen();
      timerRef.current = null;
    }, delayMs);
  };
  const cancelAndClose = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setOpen(false);
  };
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <span
      ref={triggerRef}
      style={{ display: "inline-flex" }}
      onMouseEnter={scheduleOpen}
      onMouseLeave={cancelAndClose}
      onFocus={scheduleOpen}
      onBlur={cancelAndClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") cancelAndClose();
      }}
    >
      {children}
      {/* Render the tooltip in `position: fixed` from the document root so
          it escapes any `overflow: hidden` ancestor (drawer body,
          horizontal-scroll containers, etc). Without this it gets
          clipped on plan-compare's mobile horizontal scroller. */}
      {open && coords && (
        <span
          role="tooltip"
          style={{
            position: "fixed",
            zIndex: 1000,
            left: coords.x,
            top: coords.y,
            transform:
              placement === "top"
                ? "translate(-50%, calc(-100% - 8px))"
                : "translate(-50%, 8px)",
            background: COLORS.fill,
            color: "#fff",
            fontFamily: FONTS.body,
            fontSize: 11.5,
            fontWeight: 500,
            lineHeight: 1.4,
            padding: "6px 10px",
            borderRadius: 7,
            whiteSpace: "normal",
            maxWidth: 280,
            boxShadow: "0 6px 18px rgba(11,11,13,0.18)",
            pointerEvents: "none",
          }}
        >
          {content}
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%) rotate(45deg)",
              [placement === "top" ? "bottom" : "top"]: -3,
              width: 8,
              height: 8,
              background: COLORS.fill,
            }}
          />
        </span>
      )}
    </span>
  );
}

// ─── OfflineBanner (#23) ─────────────────────────────────────────────
// Detects browser offline/online events and shows a sticky banner.

export function OfflineBanner() {
  const [offline, setOffline] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false,
  );
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const go = () => { setOffline(false); setRetrying(false); };
    const gone = () => setOffline(true);
    window.addEventListener("online", go);
    window.addEventListener("offline", gone);
    return () => { window.removeEventListener("online", go); window.removeEventListener("offline", gone); };
  }, []);

  if (!offline) return null;

  return (
    <div
      role="status"
      aria-live="assertive"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        background: COLORS.fill,
        color: "#fff",
        fontFamily: FONTS.body,
        fontSize: 13,
        fontWeight: 500,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "9px 16px",
        zIndex: 9999,
        animation: "tulala-page-fade .2s ease",
      }}
    >
      <span aria-hidden style={{ width: 7, height: 7, borderRadius: "50%", background: "#f87171", flexShrink: 0 }} />
      Connection lost · retrying…
      <button
        type="button"
        onClick={() => { setRetrying(true); setTimeout(() => setRetrying(false), 1500); }}
        style={{
          marginLeft: 4,
          background: "rgba(255,255,255,0.14)",
          border: "none",
          borderRadius: 6,
          color: "#fff",
          fontFamily: FONTS.body,
          fontSize: 12,
          fontWeight: 600,
          padding: "3px 10px",
          cursor: "pointer",
        }}
      >
        {retrying ? "Retrying…" : "Retry now"}
      </button>
    </div>
  );
}

// ─── ConfirmModal (#8) ────────────────────────────────────────────────
// Lightweight "Are you sure?" overlay for destructive actions.

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Delete",
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <div
      data-tulala-modal-overlay
      onClick={onCancel}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,11,13,0.40)",
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: "24px 24px 20px",
          maxWidth: 360,
          width: "100%",
          fontFamily: FONTS.body,
          boxShadow: "0 24px 60px rgba(11,11,13,0.28)",
          animation: "tulala-page-fade .18s ease",
        }}
      >
        <h2 style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 500, margin: "0 0 8px", color: COLORS.ink }}>
          {title}
        </h2>
        <p style={{ fontSize: 14, color: COLORS.inkMuted, margin: "0 0 20px", lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            style={{
              padding: "8px 16px",
              background: "transparent",
              border: `1px solid ${COLORS.border}`,
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 500,
              color: COLORS.ink,
              cursor: "pointer",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            style={{
              padding: "8px 16px",
              background: COLORS.red,
              border: "none",
              borderRadius: 8,
              fontFamily: FONTS.body,
              fontSize: 13,
              fontWeight: 600,
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── ShortcutsModal (#18) ────────────────────────────────────────────
// ⌘? keyboard cheatsheet. Triggered by pressing ? anywhere in the app.

const SHORTCUTS = [
  { keys: ["⌘", "K"], label: "Command palette" },
  { keys: ["⌘", "N"], label: "New inquiry" },
  { keys: ["⌘", "F"], label: "Global search" },
  { keys: ["⌘", "/"], label: "Toggle sidebar" },
  { keys: ["G", "O"], label: "Go to Overview" },
  { keys: ["G", "I"], label: "Go to Inbox" },
  { keys: ["G", "C"], label: "Go to Calendar" },
  { keys: ["G", "R"], label: "Go to Roster" },
  { keys: ["J"], label: "Next item in list" },
  { keys: ["K"], label: "Previous item in list" },
  { keys: ["E"], label: "Mark as read / done" },
  { keys: ["R"], label: "Reply" },
  { keys: ["Esc"], label: "Close drawer / modal" },
  { keys: ["?"], label: "This shortcuts panel" },
];

export function ShortcutsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      data-tulala-modal-overlay
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,11,13,0.36)",
        zIndex: 3000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Keyboard shortcuts"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "#fff",
          borderRadius: 18,
          padding: "22px 24px 20px",
          maxWidth: 440,
          width: "100%",
          fontFamily: FONTS.body,
          boxShadow: "0 24px 60px rgba(11,11,13,0.28)",
          animation: "tulala-page-fade .18s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontFamily: FONTS.display, fontSize: 20, fontWeight: 500, margin: 0, color: COLORS.ink }}>
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            autoFocus
            onClick={onClose}
            aria-label="Close"
            style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, color: COLORS.inkMuted }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div style={{ display: "grid", gap: 2 }}>
          {SHORTCUTS.map(({ keys, label }) => (
            <div
              key={label}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "7px 10px",
                borderRadius: 8,
              }}
            >
              <span style={{ fontSize: 13, color: COLORS.ink }}>{label}</span>
              <span style={{ display: "inline-flex", gap: 4 }}>
                {keys.map((k) => (
                  <kbd
                    key={k}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: 26,
                      height: 22,
                      padding: "0 6px",
                      background: COLORS.surfaceAlt,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 5,
                      fontFamily: FONTS.body,
                      fontSize: 11,
                      fontWeight: 600,
                      color: COLORS.ink,
                    }}
                  >
                    {k}
                  </kbd>
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── AutoSaveIndicator (#6) ───────────────────────────────────────────
// Displays "Saved X ago" or "Saving…" inside forms.

export function AutoSaveIndicator({ savedAt }: { savedAt: Date | null }) {
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!savedAt) return;
    const update = () => {
      const s = Math.round((Date.now() - savedAt.getTime()) / 1000);
      if (s < 5) setLabel("Saved just now");
      else if (s < 60) setLabel(`Saved ${s}s ago`);
      else setLabel(`Saved ${Math.round(s / 60)}m ago`);
    };
    update();
    const id = setInterval(update, 10_000);
    return () => clearInterval(id);
  }, [savedAt]);

  if (!savedAt) return null;
  return (
    <span
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11.5,
        color: COLORS.inkMuted,
        fontFamily: FONTS.body,
      }}
    >
      <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 6 9 17l-5-5" />
      </svg>
      {label}
    </span>
  );
}

// ─── FloatingFab (#4) ─────────────────────────────────────────────────
// Fixed "+ New" action button for mobile list pages.

export type FabAction = {
  id: string;
  label: string;
  sub?: string;
  emoji?: string;
  onClick: () => void;
};

export function FloatingFab({
  label,
  onClick,
  actions,
}: {
  label: string;
  onClick?: () => void;
  /** When provided, tapping the FAB opens a bottom-sheet with these actions
   *  instead of firing onClick. Each action becomes a row in the sheet. */
  actions?: FabAction[];
}) {
  const [open, setOpen] = useState(false);
  const hasMenu = actions && actions.length > 0;
  const handleTap = () => {
    if (hasMenu) setOpen(true);
    else onClick?.();
  };
  return (
    <>
      <button
        type="button"
        aria-label={label}
        onClick={handleTap}
        data-tulala-fab
        style={{
          position: "fixed",
          right: 18,
          bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
          width: 52,
          height: 52,
          borderRadius: "50%",
          background: COLORS.accent,
          color: "#fff",
          border: "none",
          cursor: "pointer",
          display: "none",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 6px 24px rgba(15,79,62,0.36)",
          zIndex: 400,
          transition: `transform ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
          fontFamily: FONTS.body,
          fontSize: 24,
          fontWeight: 300,
          lineHeight: 1,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.06)";
          e.currentTarget.style.boxShadow = "0 8px 28px rgba(15,79,62,0.44)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 6px 24px rgba(15,79,62,0.36)";
        }}
      >
        +
      </button>
      {hasMenu && open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 500,
            background: "rgba(11,11,13,0.42)",
            backdropFilter: "blur(6px)",
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            fontFamily: FONTS.body,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: 480,
              background: "#fff",
              borderRadius: "20px 20px 0 0",
              padding: "16px 16px max(20px, env(safe-area-inset-bottom)) 16px",
              boxShadow: "0 -10px 40px -8px rgba(11,11,13,0.30)",
            }}
          >
            <div style={{
              width: 36, height: 4, borderRadius: 999,
              background: "rgba(11,11,13,0.10)",
              margin: "0 auto 14px",
            }} />
            <div style={{
              fontSize: 11, fontWeight: 600, letterSpacing: 0.4,
              color: COLORS.inkMuted, textTransform: "uppercase",
              marginBottom: 10, paddingLeft: 4,
            }}>
              Create new
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {actions!.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => { setOpen(false); a.onClick(); }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "12px 14px",
                    borderRadius: 12,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: FONTS.body,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(11,11,13,0.04)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 36, height: 36, borderRadius: 10,
                      background: COLORS.surface,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 18, flexShrink: 0,
                    }}
                  >
                    {a.emoji ?? "+"}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>{a.label}</div>
                    {a.sub && (
                      <div style={{ fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1, lineHeight: 1.35 }}>{a.sub}</div>
                    )}
                  </div>
                  <span aria-hidden style={{ color: COLORS.inkDim, fontSize: 16 }}>›</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── RetryCard (#24) ─────────────────────────────────────────────────
// Shown when an async operation fails. Displays an error message +
// a Retry button that calls the provided callback.

export function RetryCard({
  message = "Something went wrong loading this section.",
  onRetry,
}: {
  message?: string;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "14px 18px",
        background: "#fff",
        border: `1px solid ${COLORS.border}`,
        borderRadius: 10,
        fontFamily: FONTS.body,
      }}
    >
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={COLORS.red} strokeWidth={2} strokeLinecap="round">
        <path d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      </svg>
      <span style={{ flex: 1, fontSize: 13, color: COLORS.ink }}>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        style={{
          padding: "6px 14px",
          background: "transparent",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 7,
          fontFamily: FONTS.body,
          fontSize: 12,
          fontWeight: 600,
          color: COLORS.ink,
          cursor: "pointer",
        }}
      >
        Retry
      </button>
    </div>
  );
}

// ─── ActivityFeedItem (#32) ───────────────────────────────────────────
// A single event in a workspace-level or talent-level activity feed.

export function ActivityFeedItem({
  actor,
  action,
  target,
  timestamp,
  icon,
  iconName,
}: {
  actor: string;
  action: string;
  target: string;
  timestamp: string;
  icon?: string;
  iconName?: "mail" | "check" | "bolt" | "calendar" | "settings" | "user" | "team" | "archive" | "alert";
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 10,
        padding: "10px 0",
        fontFamily: FONTS.body,
      }}
    >
      <div
        style={{
          width: 28,
          height: 28,
          borderRadius: "50%",
          background: COLORS.surfaceAlt,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          fontSize: 13,
          color: COLORS.inkMuted,
        }}
        aria-hidden
      >
        {iconName ? <Icon name={iconName} size={13} stroke={1.7} color={COLORS.inkMuted} /> : (icon ?? "📋")}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: COLORS.ink, lineHeight: 1.4 }}>
          <strong style={{ fontWeight: 600 }}>{actor}</strong>
          {" "}{action}{" "}
          <strong style={{ fontWeight: 500 }}>{target}</strong>
        </div>
        <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 2 }}>{timestamp}</div>
      </div>
    </div>
  );
}

// ─── PageSkeleton (#25) ───────────────────────────────────────────────
// Full-page skeleton shown while real data is loading. Three shimmer
// rows mimic a card list layout.

export function PageSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading…" style={{ display: "flex", flexDirection: "column", gap: 0 }}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "14px 0",
            borderTop: i > 0 ? `1px solid ${COLORS.borderSoft}` : "none",
          }}
        >
          <Skeleton width={36} height={36} radius={18} />
          <div style={{ flex: 1 }}>
            <Skeleton height={13} width="60%" style={{ marginBottom: 6 }} />
            <Skeleton height={11} width="40%" />
          </div>
          <Skeleton height={22} width={70} radius={999} />
        </div>
      ))}
    </div>
  );
}

// ─── WS-2.7 FAB host + single-FAB system ─────────────────────────────
//
// Only one FAB may be visible at a time across the whole page.
// `<FabHost>` is a React context provider. Each `<FloatingFab>` must be
// wrapped inside a `<FabHost>`; on phone viewport the first registered
// FAB wins (others are suppressed). On tablet/desktop FABs are hidden
// entirely (the topbar Quick-create menu handles creates).
//
// Usage:
//   <FabHost>
//     <OverviewPage />  ← renders <FloatingFab> somewhere inside
//   </FabHost>

type FabSlot = { id: string; label: string; onClick: () => void };

const FabContext = createContext<{
  register:   (slot: FabSlot) => void;
  unregister: (id: string) => void;
  active:     FabSlot | null;
} | null>(null);

export function FabHost({ children }: { children: ReactNode }) {
  const [slots, setSlots] = useState<FabSlot[]>([]);
  const register   = useCallback((s: FabSlot) => setSlots((p) => [...p.filter((x) => x.id !== s.id), s]), []);
  const unregister = useCallback((id: string)  => setSlots((p) => p.filter((x) => x.id !== id)), []);
  const active     = slots[0] ?? null;
  const viewport   = useViewport();
  return (
    <FabContext.Provider value={{ register, unregister, active }}>
      {children}
      {/* Render the single active FAB — phone only */}
      {active && viewport === "phone" && (
        <button
          type="button"
          aria-label={active.label}
          onClick={active.onClick}
          data-tulala-fab
          style={{
            position: "fixed",
            right: 18,
            bottom: "calc(72px + env(safe-area-inset-bottom, 0px))",
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: COLORS.accent,
            color: "#fff",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 24px rgba(15,79,62,0.36)",
            zIndex: 400,
            fontFamily: FONTS.body,
            fontSize: 24,
            fontWeight: 300,
            lineHeight: 1,
            transition: `transform ${TRANSITION.micro}, box-shadow ${TRANSITION.micro}`,
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = "scale(1.06)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
        >
          +
        </button>
      )}
    </FabContext.Provider>
  );
}

/** Register a FAB slot inside a `<FabHost>`. Phone-only; no-ops on tablet+. */
export function useFab(id: string, label: string, onClick: () => void) {
  const ctx = useContext(FabContext);
  useEffect(() => {
    if (!ctx) return;
    ctx.register({ id, label, onClick });
    return () => ctx.unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, label]);
}

// ─── WS-2.11 Sticky drawer save bar ──────────────────────────────────
//
// Auto-applied to long-form drawers. Sticks to the bottom of the drawer
// body when the user has scrolled past the top of the form. Shows a
// "Unsaved changes" label + Cancel + Save buttons. The `dirty` prop
// controls visibility. On phone it always floats; on desktop it appears
// when the save CTA has scrolled out of view.
//
// Usage inside a DrawerShell body:
//   <StickyDrawerSaveBar dirty={isDirty} onCancel={reset} onSave={submit} />

export function StickyDrawerSaveBar({
  dirty,
  saving = false,
  onCancel,
  onSave,
  label = "Unsaved changes",
  saveLabel = "Save changes",
}: {
  dirty: boolean;
  saving?: boolean;
  onCancel: () => void;
  onSave: () => void;
  label?: string;
  saveLabel?: string;
}) {
  if (!dirty) return null;
  return (
    <div
      data-tulala-sticky-save-bar
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 10,
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "10px 18px",
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        borderTop: `1px solid ${COLORS.borderSoft}`,
        boxShadow: "0 -4px 16px rgba(11,11,13,0.06)",
      }}
    >
      <span
        style={{
          flex: 1,
          fontFamily: FONTS.body,
          fontSize: 12.5,
          fontWeight: 500,
          color: COLORS.inkMuted,
        }}
      >
        {label}
      </span>
      <SecondaryButton size="sm" onClick={onCancel} disabled={saving}>
        Cancel
      </SecondaryButton>
      <PrimaryButton size="sm" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : saveLabel}
      </PrimaryButton>
    </div>
  );
}

// ─── WS-6.2 Field error primitive ────────────────────────────────────
//
// Wraps a form field with a red border + aria-invalid + inline error
// message. Pairs with any <input>, <textarea>, or <select>.
//
// Usage:
//   <FieldError error={errors.email} id="email-err">
//     <input aria-describedby="email-err" ... />
//   </FieldError>

export function FieldError({
  error,
  id,
  children,
}: {
  error?: string;
  id?: string;
  children: ReactNode;
}) {
  const hasError = Boolean(error);
  return (
    <div
      data-tulala-field-error={hasError ? "true" : undefined}
      style={{ display: "flex", flexDirection: "column", gap: 4 }}
    >
      <div
        style={{
          outline: hasError ? "1.5px solid #B0303A" : undefined,
          borderRadius: 8,
        }}
      >
        {children}
      </div>
      {hasError && (
        <span
          id={id}
          role="alert"
          style={{
            fontFamily: FONTS.body,
            fontSize: 11.5,
            color: "#B0303A",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: 4,
          }}
        >
          <span aria-hidden style={{ fontSize: 12 }}>⚠</span>
          {error}
        </span>
      )}
    </div>
  );
}

// ─── WS-6.3 Unsaved changes guard ────────────────────────────────────
//
// Wraps a drawer or page. When `dirty` is true, intercepts the close /
// navigation action and shows a confirmation dialog. If the user
// confirms ("Discard"), `onClose` fires; if they cancel they stay.
//
// Usage:
//   <UnsavedChangesGuard dirty={isDirty} onClose={closeDrawer}>
//     {content}
//   </UnsavedChangesGuard>

export function UnsavedChangesGuard({
  dirty,
  onClose,
  children,
}: {
  dirty: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const [confirming, setConfirming] = useState(false);
  const handleClose = () => {
    if (dirty) { setConfirming(true); }
    else        { onClose(); }
  };
  return (
    <>
      {/* Clone child and inject overridden close handler */}
      <div data-tulala-unsaved-guard onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => { setConfirming(false); onClose(); }}
        title="Discard unsaved changes?"
        body="You have unsaved changes. If you leave now, they'll be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        destructive
      />
      {/* Expose a close handler the drawer can call — used via render prop pattern */}
      {dirty && (
        <button
          type="button"
          data-tulala-guard-close
          onClick={handleClose}
          style={{ display: "none" }}
          aria-hidden
        />
      )}
    </>
  );
}

// ─── WS-4 ModalPopover primitive ────────────────────────────────────────────
//
// A lighter-weight overlay than a full drawer. Renders as a centered (or
// anchor-relative) floating panel with a dim backdrop. Use for:
//   – Quick-confirm / short-form interactions that don't warrant a drawer
//   – Pickers, context-menus, and inline detail views
//   – ~30 draw reclassifications in WS-4 (demotions from full drawers)
//
// API:
//   <ModalPopover
//     open={bool}
//     onClose={fn}
//     title="Optional header"
//     size="sm" | "md" | "lg"          // default "md"
//     closeOnBackdrop={bool}           // default true
//     anchorRect={DOMRect}             // optional — position near anchor
//     footer={<ReactNode>}             // optional — sticky bottom area
//   >
//     ...body...
//   </ModalPopover>
//
// Keyboard: Esc closes. Focus trap: first focusable element on open.
// ─────────────────────────────────────────────────────────────────────────────

export type ModalPopoverSize = "sm" | "md" | "lg";

const POPOVER_WIDTH: Record<ModalPopoverSize, number> = {
  sm: 320,
  md: 480,
  lg: 640,
};

/** Calculated position for an anchored popover. */
function resolveAnchorPosition(
  anchor: DOMRect,
  popoverWidth: number,
  popoverMaxHeight: number,
): CSSProperties {
  const vw = typeof window !== "undefined" ? window.innerWidth  : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const gap = 8; // px gap between anchor and popover

  // Prefer below; if not enough room, go above
  const spaceBelow = vh - anchor.bottom - gap;
  const spaceAbove = anchor.top - gap;
  const goBelow    = spaceBelow >= Math.min(popoverMaxHeight, 240) || spaceBelow >= spaceAbove;

  // Align left edge with anchor; clamp to viewport
  let left = anchor.left;
  if (left + popoverWidth > vw - 8) left = vw - popoverWidth - 8;
  if (left < 8) left = 8;

  return goBelow
    ? { top: anchor.bottom + gap, left }
    : { bottom: vh - anchor.top + gap, left };
}

export function ModalPopover({
  open,
  onClose,
  title,
  size = "md",
  closeOnBackdrop = true,
  anchorRect,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  size?: ModalPopoverSize;
  closeOnBackdrop?: boolean;
  anchorRect?: DOMRect | null;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const width    = POPOVER_WIDTH[size];

  // Close on Esc
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Focus first focusable child on open
  useEffect(() => {
    if (!open || !panelRef.current) return;
    const el = panelRef.current.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    el?.focus();
  }, [open]);

  if (!open) return null;

  const isAnchored = !!anchorRect;
  const anchorStyles: CSSProperties = isAnchored
    ? resolveAnchorPosition(anchorRect!, width, 480)
    : {};

  // Overlay style — dim full viewport when not anchored
  const overlayStyle: CSSProperties = {
    position:        "fixed",
    inset:           0,
    zIndex:          1100,
    display:         "flex",
    alignItems:      isAnchored ? "flex-start" : "center",
    justifyContent:  isAnchored ? "flex-start" : "center",
    background:      isAnchored ? "transparent" : "rgba(0,0,0,0.35)",
    padding:         isAnchored ? 0 : "24px 16px",
  };

  const panelStyle: CSSProperties = {
    position:        isAnchored ? "fixed" : "relative",
    width,
    maxWidth:        "calc(100vw - 32px)",
    maxHeight:       isAnchored ? 480 : "calc(100vh - 48px)",
    background:      COLORS.surface,
    borderRadius:    RADIUS.xl,
    boxShadow:       "0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.10)",
    border:          `1px solid ${COLORS.border}`,
    display:         "flex",
    flexDirection:   "column",
    overflow:        "hidden",
    ...anchorStyles,
  };

  return (
    // Backdrop
    <div
      style={overlayStyle}
      data-tulala-modal-popover="overlay"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? "Popover"}
        data-tulala-modal-popover="panel"
        style={panelStyle}
      >
        {/* Header */}
        {title && (
          <div
            style={{
              display:        "flex",
              alignItems:     "center",
              justifyContent: "space-between",
              padding:        "14px 16px 12px",
              borderBottom:   `1px solid ${COLORS.border}`,
              flexShrink:     0,
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink }}>
              {title}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              style={{
                background: "none",
                border:     "none",
                cursor:     "pointer",
                padding:    "2px 4px",
                color:      COLORS.inkMuted,
                fontSize:   18,
                lineHeight: 1,
                borderRadius: RADIUS.sm,
              }}
            >
              ×
            </button>
          </div>
        )}

        {/* Scrollable body */}
        <div
          data-tulala-modal-popover-body
          style={{
            flex:       "1 1 auto",
            overflowY:  "auto",
            padding:    "16px",
          }}
        >
          {children}
        </div>

        {/* Optional footer */}
        {footer && (
          <div
            style={{
              flexShrink:  0,
              padding:     "12px 16px",
              borderTop:   `1px solid ${COLORS.border}`,
              display:     "flex",
              gap:         8,
              justifyContent: "flex-end",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── WS-6.4 Optimistic UI rollback recipe ────────────────────────────────────
//
// `useOptimisticMutation` wraps a server mutation with:
//   1. Immediate optimistic state application (no wait for server)
//   2. Automatic rollback on failure (reverts to the pre-mutation value)
//   3. `status` for visual feedback ("idle" | "pending" | "error")
//   4. `retry` to re-run the last mutation without re-applying optimistic state
//
// Usage:
//   const { display, status, mutate } = useOptimisticMutation({
//     value: someState,
//     onCommit: async (next) => {
//       await api.update(next);    // the real server call
//       setState(next);            // confirm after server agrees
//     },
//   });
//
//   // To mutate:
//   await mutate(newValue);        // display = newValue immediately
//                                  // on error: display rolls back to previous value
//
// Design decisions:
//   - Does NOT call `setState` on rollback — caller's external state
//     (the `value` prop) is the source of truth after rollback, since
//     the failed `onCommit` never called setState.
//   - The hook keeps its own `display` so rollback is instant (no
//     waiting for a parent re-render).
//   - `retry` calls `onCommit` again with the last attempted `next`
//     value, without re-triggering the optimistic update (display is
//     already showing the optimistic value from the failed attempt).
// ─────────────────────────────────────────────────────────────────────────────

export type OptimisticStatus = "idle" | "pending" | "error";

export function useOptimisticMutation<T>({
  value,
  onCommit,
  onRollback,
}: {
  /** Current confirmed value — what we show when idle or after rollback. */
  value: T;
  /**
   * Async function that persists `next` to the server.
   * If it throws, the mutation rolls back.
   */
  onCommit: (next: T) => Promise<void>;
  /**
   * Optional callback when a rollback happens — e.g. to fire an error
   * toast or re-sync derived state.
   */
  onRollback?: (previous: T, error: unknown) => void;
}): {
  /** The value to render — optimistic during pending, rolled-back after error. */
  display:  T;
  /** "idle" → "pending" → "idle" (success) or "error" (failure). */
  status:   OptimisticStatus;
  /** Apply an optimistic update and fire `onCommit`. */
  mutate:   (next: T) => Promise<void>;
  /** Re-run the last failed mutation (no-op if status isn't "error"). */
  retry:    () => Promise<void>;
} {
  const [display,  setDisplay]  = useState<T>(value);
  const [status,   setStatus]   = useState<OptimisticStatus>("idle");
  const lastAttempt = useRef<T>(value);

  // Keep display in sync with confirmed value when idle (avoids stale display
  // if parent updates the prop through an out-of-band channel).
  useEffect(() => {
    if (status === "idle") setDisplay(value);
  }, [value, status]);

  const run = useCallback(async (next: T, isRetry: boolean) => {
    const previous = isRetry ? value : display;
    if (!isRetry) {
      lastAttempt.current = next;
      setDisplay(next);      // optimistic
    }
    setStatus("pending");
    try {
      await onCommit(next);
      setStatus("idle");
    } catch (err) {
      setDisplay(previous);  // rollback
      setStatus("error");
      onRollback?.(previous, err);
    }
  }, [value, display, onCommit, onRollback]);

  const mutate = useCallback((next: T) => run(next, false), [run]);

  const retry = useCallback(() => {
    if (status !== "error") return Promise.resolve();
    return run(lastAttempt.current, true);
  }, [status, run]);

  return { display, status, mutate, retry };
}

// ─── WS-6.5 Offline status hook ───────────────────────────────────────────────
//
// `useOnlineStatus` — reactive boolean, true when navigator.onLine.
// Pair with the existing `<OfflineBanner>` in the workspace shell.
// ─────────────────────────────────────────────────────────────────────────────

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(
    typeof navigator !== "undefined" ? navigator.onLine : true
  );
  useEffect(() => {
    const up   = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener("online",  up);
    window.addEventListener("offline", down);
    return () => {
      window.removeEventListener("online",  up);
      window.removeEventListener("offline", down);
    };
  }, []);
  return online;
}

// ─── WS-6.7 AsyncButton — sending / failed / retry ───────────────────────────
//
// Drop-in replacement for a button that fires an async action.
// Shows a spinner while pending, a retry state on failure.
//
// Usage:
//   <AsyncButton onClick={async () => { await api.save(data); }}>
//     Save changes
//   </AsyncButton>
// ─────────────────────────────────────────────────────────────────────────────

export function AsyncButton({
  onClick,
  children,
  retryLabel = "Retry",
  pendingLabel,
  errorLabel,
  disabled = false,
  variant = "primary",
  style: styleProp,
}: {
  onClick: () => Promise<void>;
  children: ReactNode;
  retryLabel?:   string;
  pendingLabel?: string;
  errorLabel?:   string;
  disabled?:     boolean;
  variant?:      "primary" | "secondary" | "danger";
  style?:        CSSProperties;
}) {
  const [state, setState] = useState<"idle" | "pending" | "error">("idle");

  const BASE: CSSProperties = {
    display:       "inline-flex",
    alignItems:    "center",
    gap:           6,
    padding:       "8px 16px",
    borderRadius:  RADIUS.md,
    border:        "none",
    fontFamily:    FONTS.body,
    fontSize:      13,
    fontWeight:    600,
    cursor:        (disabled || state === "pending") ? "not-allowed" : "pointer",
    opacity:       (disabled || state === "pending") ? 0.65 : 1,
    transition:    `background ${TRANSITION.sm}, opacity ${TRANSITION.sm}`,
    ...styleProp,
  };

  const VARIANTS: Record<string, CSSProperties> = {
    primary:   { background: COLORS.accent, color: "#fff" },
    secondary: { background: COLORS.card,   color: COLORS.ink, border: `1px solid ${COLORS.border}` },
    danger:    { background: "#dc2626",      color: "#fff" },
  };

  const ERROR_VARIANT: CSSProperties = { background: "#7f1d1d", color: "#fff" };

  const handleClick = async () => {
    if (disabled || state === "pending") return;
    setState("pending");
    try {
      await onClick();
      setState("idle");
    } catch {
      setState("error");
    }
  };

  const label =
    state === "pending" ? (pendingLabel ?? children) :
    state === "error"   ? (errorLabel   ?? retryLabel)
                        : children;

  const variantStyle = state === "error" ? ERROR_VARIANT : VARIANTS[variant];

  return (
    <button
      type="button"
      disabled={disabled || state === "pending"}
      onClick={handleClick}
      style={{ ...BASE, ...variantStyle }}
    >
      {state === "pending" && (
        <span
          aria-hidden
          style={{
            width: 12, height: 12,
            border: "2px solid rgba(255,255,255,0.35)",
            borderTopColor: "#fff",
            borderRadius: "50%",
            animation: "tulalaSpinBtn .6s linear infinite",
            flexShrink: 0,
          }}
        />
      )}
      {state === "error" && <span aria-hidden>↺</span>}
      <span>{label}</span>
      <style>{`@keyframes tulalaSpinBtn { to { transform: rotate(360deg); } }`}</style>
    </button>
  );
}

// ─── WS-9.7 GuidedTour primitive ─────────────────────────────────────────────
//
// Spotlight + tooltip step-by-step tour. Dismissible and resumable via
// localStorage. Used for first-run onboarding flows and feature discovery.
//
// Architecture:
//   - <GuidedTour> takes an ordered `steps` array and a `tourId`.
//   - Each step targets a DOM element via a CSS selector (`target`).
//   - A semi-transparent overlay dims the page; the target element
//     is "spotlighted" by cutting a hole in the overlay.
//   - A tooltip floats near the target with title, body, and Prev/Next.
//   - `tourId` is written to localStorage on dismiss/complete so the
//     tour doesn't re-appear on reload.
//
// Usage:
//   <GuidedTour
//     tourId="workspace-v1"
//     steps={[
//       { target: "[data-tulala-app-topbar]", title: "Your topbar", body: "Navigate between pages here." },
//       { target: "[data-tulala-surface-main]", title: "Main area", body: "Your work lives here." },
//     ]}
//     onComplete={() => console.log("Tour done")}
//   />
// ─────────────────────────────────────────────────────────────────────────────

export type TourStep = {
  /** CSS selector for the element to spotlight. If null, no spotlight. */
  target: string | null;
  title:  string;
  body:   string;
  /** Optional CTA label + handler inline with Next */
  ctaLabel?: string;
  onCta?:    () => void;
};

const TOUR_SEEN_PREFIX = "tulala-tour-seen-";

export function GuidedTour({
  tourId,
  steps,
  onComplete,
  onDismiss,
}: {
  tourId:      string;
  steps:       TourStep[];
  onComplete?: () => void;
  onDismiss?:  () => void;
}) {
  const [stepIdx, setStepIdx] = useState(0);
  const [dismissed, setDismissed] = useState(() => {
    try { return !!localStorage.getItem(TOUR_SEEN_PREFIX + tourId); } catch { return false; }
  });
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[stepIdx];

  // Find target rect on step change
  useEffect(() => {
    if (!step?.target) { setRect(null); return; }
    const el = document.querySelector(step.target);
    setRect(el?.getBoundingClientRect() ?? null);
  }, [stepIdx, step?.target]);

  const finish = (complete: boolean) => {
    try { localStorage.setItem(TOUR_SEEN_PREFIX + tourId, "1"); } catch {}
    setDismissed(true);
    if (complete) onComplete?.();
    else          onDismiss?.();
  };

  if (dismissed || !step) return null;

  const isLast = stepIdx === steps.length - 1;

  // Tooltip positioning: below the spotlight by default; flip up if near bottom
  const vw = typeof window !== "undefined" ? window.innerWidth  : 1280;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const TOOLTIP_W = 280;
  let tipLeft = rect ? Math.min(rect.left, vw - TOOLTIP_W - 16) : (vw - TOOLTIP_W) / 2;
  let tipTop  = rect ? rect.bottom + 12 : vh * 0.42;
  if (rect && rect.bottom + 180 > vh) tipTop = rect.top - 180 - 12;

  return (
    <div
      data-tulala-guided-tour={tourId}
      style={{ position: "fixed", inset: 0, zIndex: 1300, pointerEvents: "none" }}
    >
      {/* Spotlight overlay — two rects: full viewport minus cutout */}
      {rect ? (
        <>
          {/* Top strip */}
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: rect.top - 4, background: "rgba(0,0,0,0.45)", pointerEvents: "auto" }} onClick={() => finish(false)} />
          {/* Left strip */}
          <div style={{ position: "absolute", top: rect.top - 4, left: 0, width: Math.max(0, rect.left - 4), height: rect.height + 8, background: "rgba(0,0,0,0.45)", pointerEvents: "auto" }} onClick={() => finish(false)} />
          {/* Right strip */}
          <div style={{ position: "absolute", top: rect.top - 4, right: 0, left: rect.right + 4, height: rect.height + 8, background: "rgba(0,0,0,0.45)", pointerEvents: "auto" }} onClick={() => finish(false)} />
          {/* Bottom strip */}
          <div style={{ position: "absolute", top: rect.bottom + 4, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.45)", pointerEvents: "auto" }} onClick={() => finish(false)} />
          {/* Spotlight ring */}
          <div style={{
            position: "absolute",
            top:    rect.top    - 4,
            left:   rect.left   - 4,
            width:  rect.width  + 8,
            height: rect.height + 8,
            borderRadius: RADIUS.md,
            boxShadow: `0 0 0 3px ${COLORS.accent}`,
            pointerEvents: "none",
          }} />
        </>
      ) : (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", pointerEvents: "auto" }} onClick={() => finish(false)} />
      )}

      {/* Tooltip */}
      <div
        style={{
          position:      "fixed",
          left:          tipLeft,
          top:           tipTop,
          width:         TOOLTIP_W,
          background:    COLORS.surface,
          borderRadius:  RADIUS.xl,
          boxShadow:     "0 16px 48px rgba(0,0,0,0.22), 0 4px 12px rgba(0,0,0,0.10)",
          border:        `1px solid ${COLORS.border}`,
          padding:       "16px",
          pointerEvents: "auto",
          zIndex:        1301,
        }}
      >
        {/* Step counter */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.inkMuted, fontFamily: FONTS.body }}>
            Step {stepIdx + 1} of {steps.length}
          </span>
          <button
            type="button"
            onClick={() => finish(false)}
            aria-label="Dismiss tour"
            style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.inkMuted, fontSize: 16, lineHeight: 1, padding: 0 }}
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div style={{ fontSize: 14, fontWeight: 700, color: COLORS.ink, fontFamily: FONTS.body, marginBottom: 4 }}>
          {step.title}
        </div>
        <div style={{ fontSize: 12, color: COLORS.inkMuted, fontFamily: FONTS.body, lineHeight: 1.5, marginBottom: 14 }}>
          {step.body}
        </div>

        {/* Progress dots */}
        <div style={{ display: "flex", gap: 4, marginBottom: 12 }}>
          {steps.map((_, i) => (
            <div key={i} style={{
              width:        i === stepIdx ? 16 : 5,
              height:       5,
              borderRadius: 999,
              background:   i === stepIdx ? COLORS.accent : COLORS.border,
              transition:   `width ${TRANSITION.sm}, background ${TRANSITION.sm}`,
            }} />
          ))}
        </div>

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          {stepIdx > 0 && (
            <button type="button" onClick={() => setStepIdx((i) => i - 1)} style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`, borderRadius: RADIUS.md, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: COLORS.ink, fontFamily: FONTS.body }}>
              Back
            </button>
          )}
          {step.ctaLabel && step.onCta && (
            <button type="button" onClick={() => { step.onCta!(); setStepIdx((i) => Math.min(i + 1, steps.length - 1)); }} style={{ background: COLORS.accentSoft, border: "none", borderRadius: RADIUS.md, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: COLORS.accent, fontFamily: FONTS.body }}>
              {step.ctaLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => isLast ? finish(true) : setStepIdx((i) => i + 1)}
            style={{ background: COLORS.fill, border: "none", borderRadius: RADIUS.md, padding: "5px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer", color: "#fff", fontFamily: FONTS.body }}
          >
            {isLast ? "Done ✓" : "Next →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-6.6  Stale-data detection — "Updated by Marco — refresh ↻" pill
// ─────────────────────────────────────────────────────────────────────────────
//
//  data-tulala-stale-pill   — the refresh pill
//
// Usage:
//   const { stale, touch, dismiss } = useStaleDetection("inquiries", 15_000);
//   <StaleDataPill stale={stale} by="Marco" onRefresh={touch} onDismiss={dismiss} />

export type StaleInfo = { stale: boolean; by: string; at: Date };

/** Simulates a remote update from another user (prototype-only). */
export function useStaleDetection(
  surfaceId: string,
  intervalMs = 20_000,
): { stale: boolean; staleMeta: StaleInfo | null; touch: () => void; dismiss: () => void } {
  const NAMES = ["Marco", "Sofia", "Lena", "Nico", "Ana"];
  const [staleMeta, setStaleMeta] = useState<StaleInfo | null>(null);

  // Simulate a remote update after intervalMs
  useEffect(() => {
    const tid = setTimeout(() => {
      const by = NAMES[Math.floor(Math.random() * NAMES.length)];
      setStaleMeta({ stale: true, by, at: new Date() });
    }, intervalMs);
    return () => clearTimeout(tid);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [surfaceId, intervalMs]);

  const touch   = useCallback(() => setStaleMeta(null), []);
  const dismiss = useCallback(() => setStaleMeta(null), []);

  return { stale: !!staleMeta?.stale, staleMeta, touch, dismiss };
}

export function StaleDataPill({
  stale,
  by,
  onRefresh,
  onDismiss,
}: {
  stale:     boolean;
  by?:       string;
  onRefresh: () => void;
  onDismiss: () => void;
}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (stale) setVisible(true);
  }, [stale]);

  if (!visible) return null;

  return (
    <div
      data-tulala-stale-pill
      role="status"
      aria-live="polite"
      style={{
        display:      "inline-flex",
        alignItems:   "center",
        gap:          6,
        background:   COLORS.surfaceAlt,
        border:       `1px solid ${COLORS.border}`,
        borderRadius: 999,
        padding:      "4px 10px 4px 8px",
        fontSize:     12,
        color:        COLORS.ink,
        fontFamily:   FONTS.body,
        boxShadow:    "0 2px 8px rgba(0,0,0,0.08)",
        animation:    "tulalaStaleIn .25s ease",
      }}
    >
      <style>{`@keyframes tulalaStaleIn { from { opacity:0; transform: translateY(-4px); } to { opacity:1; transform: translateY(0); } }`}</style>
      <span style={{ fontSize: 13 }}>↑</span>
      <span>
        {by ? <strong>{by}</strong> : "Someone"} made changes
        {" — "}
        <button
          type="button"
          onClick={() => { setVisible(false); onRefresh(); }}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: COLORS.accent, fontWeight: 700, fontSize: 12,
            fontFamily: FONTS.body, padding: 0, textDecoration: "underline",
          }}
        >
          refresh ↻
        </button>
      </span>
      <button
        type="button"
        aria-label="Dismiss stale notice"
        onClick={() => { setVisible(false); onDismiss(); }}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: COLORS.inkMuted, fontSize: 14, lineHeight: 1,
          marginLeft: 4, padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-6.8  Conflict-resolution dialog — two users edit; show diff; pick winner
// ─────────────────────────────────────────────────────────────────────────────
//
//  data-tulala-conflict-dialog   — the modal wrapper
//
// Usage:
//   <ConflictDialog
//     open={hasConflict}
//     field="Description"
//     yourValue="Available weekends only"
//     theirValue="Available Mon–Fri, 9am–6pm"
//     theirAuthor="Marco"
//     onKeepMine={() => resolve("mine")}
//     onKeepTheirs={() => resolve("theirs")}
//     onClose={() => setConflict(false)}
//   />

export function ConflictDialog({
  open,
  field,
  yourValue,
  theirValue,
  theirAuthor = "Another user",
  onKeepMine,
  onKeepTheirs,
  onClose,
}: {
  open:         boolean;
  field:        string;
  yourValue:    string;
  theirValue:   string;
  theirAuthor?: string;
  onKeepMine:   () => void;
  onKeepTheirs: () => void;
  onClose:      () => void;
}) {
  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const SIDE: CSSProperties = {
    flex: 1, background: COLORS.surfaceAlt, borderRadius: RADIUS.lg,
    padding: "14px 16px", border: `1px solid ${COLORS.border}`, fontSize: 13,
    color: COLORS.ink, fontFamily: FONTS.body, lineHeight: 1.55,
  };
  const PICK_BTN: CSSProperties = {
    width: "100%", marginTop: 10, padding: "8px 0",
    borderRadius: RADIUS.md, fontWeight: 700, fontSize: 13,
    fontFamily: FONTS.body, cursor: "pointer", border: "none",
    transition: `opacity ${TRANSITION.sm}`,
  };

  return (
    <div
      data-tulala-conflict-dialog
      style={{
        position: "fixed", inset: 0, zIndex: Z.modalPanel,
        background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Conflict on ${field}`}
        style={{
          background:   COLORS.surface,
          borderRadius: RADIUS.xl,
          boxShadow:    "0 24px 80px rgba(0,0,0,0.24), 0 6px 24px rgba(0,0,0,0.12)",
          border:       `1px solid ${COLORS.border}`,
          padding:      "24px",
          width:        "min(92vw, 620px)",
          fontFamily:   FONTS.body,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: COLORS.ink, marginBottom: 2 }}>
              Edit conflict
            </div>
            <div style={{ fontSize: 13, color: COLORS.inkMuted }}>
              <strong>{theirAuthor}</strong> also edited <em>{field}</em>. Choose which version to keep.
            </div>
          </div>
          <button type="button" onClick={onClose}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 20, color: COLORS.inkMuted, lineHeight: 1, padding: 0 }}>
            ×
          </button>
        </div>

        {/* Two-column diff */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {/* Your version */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.inkMuted, marginBottom: 6 }}>
              Your version
            </div>
            <div style={SIDE}>{yourValue}</div>
            <button
              type="button"
              onClick={() => { onKeepMine(); onClose(); }}
              style={{ ...PICK_BTN, background: COLORS.accent, color: "#fff" }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.88")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Keep mine
            </button>
          </div>

          {/* Their version */}
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: COLORS.inkMuted, marginBottom: 6 }}>
              {theirAuthor}&rsquo;s version
            </div>
            <div style={{ ...SIDE, borderColor: COLORS.accent + "55" }}>{theirValue}</div>
            <button
              type="button"
              onClick={() => { onKeepTheirs(); onClose(); }}
              style={{ ...PICK_BTN, background: COLORS.surfaceAlt, color: COLORS.ink, border: `1px solid ${COLORS.border}` }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.75")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              Keep {theirAuthor}&rsquo;s
            </button>
          </div>
        </div>

        {/* Footer */}
        <div style={{ marginTop: 16, fontSize: 12, color: COLORS.inkMuted, textAlign: "center" }}>
          Your changes will be discarded if you keep the other version.
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-6.9  Empty states per surface — 12 pre-wired variants
// ─────────────────────────────────────────────────────────────────────────────
//
// All use the existing <EmptyState> primitive; each export is a thin wrapper
// with surface-specific copy + icon.  The caller passes action callbacks.

type EmptyVariantProps = {
  onPrimary?: () => void;
  onSecondary?: () => void;
};

export function InboxEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="mail"
      title="Your inbox is clear"
      body="No new messages waiting. Conversations about inquiries and bookings will appear here."
      primaryLabel={onPrimary ? "Browse talent" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function InquiriesEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="search"
      title="No inquiries yet"
      body="Send your first inquiry to start the booking process. Responses typically arrive within 24 hours."
      primaryLabel={onPrimary ? "New inquiry" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function BookingsEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="calendar"
      title="No bookings yet"
      body="Confirmed bookings appear here. Inquiries convert to bookings once both parties agree on terms."
      primaryLabel={onPrimary ? "See inquiries" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function TalentRosterEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="team"
      title="Your roster is empty"
      body="Add talent to your workspace to manage inquiries, bookings, and performance from one place."
      primaryLabel={onPrimary ? "Add talent" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function ClientsEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="user"
      title="No clients yet"
      body="Clients who book through your workspace will appear here along with their spend history."
      primaryLabel={onPrimary ? "Share booking link" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function ShortlistsEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="sparkle"
      title="No shortlists saved"
      body="Shortlists let you group talent for a project and share them with collaborators for review."
      primaryLabel={onPrimary ? "Browse talent" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function CalendarEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="calendar"
      title="Nothing scheduled"
      body="Confirmed bookings and set-call appointments will appear on your calendar automatically."
      primaryLabel={onPrimary ? "View bookings" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function MessagesEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="mail"
      title="No messages yet"
      body="Start a conversation by sending an inquiry. All replies and notes will be threaded here."
      primaryLabel={onPrimary ? "Compose" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function FilesEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="info"
      title="No files attached"
      body="Upload call sheets, contracts, or mood boards to keep everything linked to this project."
      primaryLabel={onPrimary ? "Upload file" : undefined}
      onPrimary={onPrimary}
    />
  );
}

export function SearchEmptyState({ query }: { query?: string }) {
  return (
    <EmptyState
      icon="search"
      title={query ? `No results for "${query}"` : "No results"}
      body="Try different keywords, or adjust your filters to broaden the search."
    />
  );
}

export function NotificationsEmptyState() {
  return (
    <EmptyState
      icon="sparkle"
      title="All caught up"
      body="You're up to date. Notifications about activity across your workspace will appear here."
    />
  );
}

export function AgenciesEmptyState({ onPrimary }: EmptyVariantProps) {
  return (
    <EmptyState
      icon="team"
      title="Not represented by any agency"
      body="When an agency adds you to their roster, they'll appear here. You can also request representation."
      primaryLabel={onPrimary ? "Request representation" : undefined}
      onPrimary={onPrimary}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-6.10  Skeleton states per surface — 8 most-used pages / drawers
// ─────────────────────────────────────────────────────────────────────────────

function SkRow({ label = true, action = false }: { label?: boolean; action?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: `1px solid ${COLORS.border}` }}>
      <Skeleton width={36} height={36} radius={18} />
      <div style={{ flex: 1 }}>
        {label && <Skeleton height={13} width="55%" style={{ marginBottom: 5 }} />}
        <Skeleton height={11} width="35%" />
      </div>
      {action && <Skeleton height={28} width={72} radius={6} />}
    </div>
  );
}

/** Skeleton for the inbox/messages list */
export function InboxSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div data-tulala-skeleton="inbox" style={{ padding: "0 16px" }}>
      {Array.from({ length: rows }).map((_, i) => (
        <SkRow key={i} label action={i === 0} />
      ))}
    </div>
  );
}

/** Skeleton for the inquiries list */
export function InquiriesSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div data-tulala-skeleton="inquiries" style={{ padding: "0 16px" }}>
      <Skeleton height={32} width={220} radius={999} style={{ marginBottom: 12, marginTop: 4 }} />
      {Array.from({ length: rows }).map((_, i) => (
        <SkRow key={i} action />
      ))}
    </div>
  );
}

/** Skeleton for the talent roster */
export function TalentRosterSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div data-tulala-skeleton="talent-roster" style={{ padding: "0 16px" }}>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, marginTop: 4 }}>
        <Skeleton height={32} width={120} radius={999} />
        <Skeleton height={32} width={80}  radius={999} />
        <Skeleton height={32} width={96}  radius={999} />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <SkRow key={i} action />
      ))}
    </div>
  );
}

/** Skeleton for a booking / inquiry detail drawer */
export function DrawerDetailSkeleton() {
  return (
    <div data-tulala-skeleton="drawer-detail" style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Title area */}
      <div>
        <Skeleton height={9} width={60} style={{ marginBottom: 8 }} />
        <Skeleton height={18} width="70%" style={{ marginBottom: 6 }} />
        <Skeleton height={13} width="45%" />
      </div>
      <Skeleton height={1} width="100%" />
      {/* Meta grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        {[80, 100, 120, 90, 110, 75].map((w, i) => (
          <div key={i}>
            <Skeleton height={9} width={w * 0.7} style={{ marginBottom: 5 }} />
            <Skeleton height={13} width={w} />
          </div>
        ))}
      </div>
      <Skeleton height={1} width="100%" />
      {/* Message threads */}
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <Skeleton width={28} height={28} radius={14} />
          <div style={{ flex: 1 }}>
            <Skeleton height={11} width="40%" style={{ marginBottom: 5 }} />
            <Skeleton height={13} width="90%" style={{ marginBottom: 4 }} />
            <Skeleton height={13} width="65%" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton for the calendar page */
export function CalendarSkeleton() {
  return (
    <div data-tulala-skeleton="calendar" style={{ padding: "16px" }}>
      {/* Month header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Skeleton height={20} width={120} />
        <div style={{ display: "flex", gap: 8 }}>
          <Skeleton height={32} width={32} radius={8} />
          <Skeleton height={32} width={32} radius={8} />
        </div>
      </div>
      {/* Day-of-week labels */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 8 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} height={10} width="80%" style={{ margin: "0 auto" }} />
        ))}
      </div>
      {/* Calendar grid */}
      {Array.from({ length: 5 }).map((_, row) => (
        <div key={row} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
          {Array.from({ length: 7 }).map((_, col) => (
            <Skeleton key={col} height={52} width="100%" radius={6} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton for an overview / dashboard page */
export function OverviewSkeleton() {
  return (
    <div data-tulala-skeleton="overview" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Stat tiles row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ background: COLORS.surfaceAlt, borderRadius: RADIUS.lg, padding: "16px", border: `1px solid ${COLORS.border}` }}>
            <Skeleton height={10} width="60%" style={{ marginBottom: 10 }} />
            <Skeleton height={28} width="45%" style={{ marginBottom: 6 }} />
            <Skeleton height={9}  width="40%" />
          </div>
        ))}
      </div>
      {/* Recent activity */}
      <div style={{ background: COLORS.surfaceAlt, borderRadius: RADIUS.lg, padding: "16px", border: `1px solid ${COLORS.border}` }}>
        <Skeleton height={14} width={120} style={{ marginBottom: 14 }} />
        {[0, 1, 2, 3, 4].map((i) => (
          <SkRow key={i} />
        ))}
      </div>
    </div>
  );
}

/** Skeleton for the talent Today page */
export function TalentTodaySkeleton() {
  return (
    <div data-tulala-skeleton="talent-today" style={{ padding: "16px", display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Greeting */}
      <div>
        <Skeleton height={22} width="40%" style={{ marginBottom: 8 }} />
        <Skeleton height={13} width="60%" />
      </div>
      {/* Checklist card */}
      <div style={{ background: COLORS.surfaceAlt, borderRadius: RADIUS.lg, padding: 16, border: `1px solid ${COLORS.border}` }}>
        <Skeleton height={14} width={140} style={{ marginBottom: 12 }} />
        {[80, 90, 75].map((w, i) => (
          <div key={i} style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 10 }}>
            <Skeleton width={16} height={16} radius={4} />
            <Skeleton height={12} width={`${w}%`} />
          </div>
        ))}
      </div>
      {/* Week strip */}
      <div style={{ display: "flex", gap: 8 }}>
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} width={36} height={56} radius={8} style={{ flex: 1 }} />
        ))}
      </div>
      {/* Earnings grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div style={{ background: COLORS.surfaceAlt, borderRadius: RADIUS.lg, padding: 16, border: `1px solid ${COLORS.border}` }}>
          <Skeleton height={10} width="50%" style={{ marginBottom: 10 }} />
          <Skeleton height={28} width="55%" style={{ marginBottom: 8 }} />
          <Skeleton height={36} width="100%" radius={4} />
        </div>
        <div style={{ background: COLORS.surfaceAlt, borderRadius: RADIUS.lg, padding: 16, border: `1px solid ${COLORS.border}` }}>
          <Skeleton height={10} width="50%" style={{ marginBottom: 10 }} />
          {[90, 70, 80].map((w, i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <Skeleton height={11} width={`${w * 0.7}%`} />
              <Skeleton height={11} width="20%" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Skeleton for the client discover/search page */
export function DiscoverSkeleton({ cards = 9 }: { cards?: number }) {
  return (
    <div data-tulala-skeleton="discover" style={{ padding: "16px" }}>
      {/* Search bar */}
      <Skeleton height={40} width="100%" radius={999} style={{ marginBottom: 16 }} />
      {/* Filter chips */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16, overflowX: "auto" }}>
        {[60, 80, 70, 90, 65].map((w, i) => (
          <Skeleton key={i} height={28} width={w} radius={999} />
        ))}
      </div>
      {/* Card grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {Array.from({ length: cards }).map((_, i) => (
          <div key={i} style={{ borderRadius: RADIUS.lg, overflow: "hidden", border: `1px solid ${COLORS.border}` }}>
            <Skeleton height={180} width="100%" radius={0} />
            <div style={{ padding: "12px" }}>
              <Skeleton height={14} width="65%" style={{ marginBottom: 6 }} />
              <Skeleton height={11} width="45%" style={{ marginBottom: 8 }} />
              <Skeleton height={24} width={80} radius={999} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-10.2  Inline file preview — PDF / image / video / audio in message threads
// ─────────────────────────────────────────────────────────────────────────────

export type AttachmentKind = "image" | "pdf" | "video" | "audio" | "file";

export type Attachment = {
  id:       string;
  name:     string;
  kind:     AttachmentKind;
  size:     string;
  thumbUrl?: string;
  /** Prototype: always undefined; real implementation loads actual URL */
  previewUrl?: string;
};

const ATTACHMENT_ICON: Record<AttachmentKind, string> = {
  image: "🖼",
  pdf:   "📄",
  video: "🎬",
  audio: "🎵",
  file:  "📎",
};

export function InlineFilePreview({
  attachment,
  onDownload,
}: {
  attachment:  Attachment;
  onDownload?: (a: Attachment) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const isPreviewable = attachment.kind === "image" || attachment.kind === "pdf";

  return (
    <div
      style={{
        border:       `1px solid ${COLORS.border}`,
        borderRadius: RADIUS.lg,
        overflow:     "hidden",
        background:   COLORS.surfaceAlt,
        display:      "inline-flex",
        flexDirection: "column",
        maxWidth:     260,
        fontFamily:   FONTS.body,
      }}
    >
      {/* Image preview placeholder */}
      {expanded && attachment.kind === "image" && (
        <div style={{
          width: "100%", height: 160,
          background: "linear-gradient(135deg, #E0E7FF 0%, #F0FDF4 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 40,
        }}>
          {ATTACHMENT_ICON.image}
        </div>
      )}

      {/* Meta row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px" }}>
        <span style={{ fontSize: 20, flexShrink: 0 }}>{ATTACHMENT_ICON[attachment.kind]}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12.5, fontWeight: 600, color: COLORS.ink,
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          }}>
            {attachment.name}
          </div>
          <div style={{ fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>{attachment.size}</div>
        </div>
        <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
          {isPreviewable && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-label={expanded ? "Collapse preview" : "Expand preview"}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: COLORS.inkMuted, fontSize: 13, padding: "2px 4px",
              }}
            >
              {expanded ? "▲" : "▼"}
            </button>
          )}
          {onDownload && (
            <button
              type="button"
              onClick={() => onDownload(attachment)}
              aria-label={`Download ${attachment.name}`}
              style={{
                background: "none", border: "none", cursor: "pointer",
                color: COLORS.inkMuted, fontSize: 13, padding: "2px 4px",
              }}
            >
              ↓
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Renders a horizontal strip of up to N attachments in a message */
export function AttachmentStrip({
  attachments,
  onDownload,
}: {
  attachments: Attachment[];
  onDownload?: (a: Attachment) => void;
}) {
  if (!attachments.length) return null;
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
      {attachments.map((a) => (
        <InlineFilePreview key={a.id} attachment={a} onDownload={onDownload} />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-12.11  Reduced-motion hook (site-wide)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the user has requested reduced motion.
 * Use to guard any `animation:` or `transition:` inline style.
 *
 * Usage:
 *   const prefersReducedMotion = useReducedMotion();
 *   style={{ transition: prefersReducedMotion ? "none" : "opacity .2s" }}
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mql.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, []);
  return reduced;
}

/**
 * WS-12.11 — Returns the appropriate ScrollBehavior for JS scroll calls.
 * CSS transitions are handled by the global `@media (prefers-reduced-motion)`
 * rule in page.tsx; this handles `scrollTo({ behavior })` calls that
 * CSS cannot intercept.
 *
 * Usage:
 *   element.scrollTo({ top: 0, behavior: scrollBehavior() });
 */
export function scrollBehavior(): ScrollBehavior {
  if (typeof window === "undefined") return "smooth";
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ? "instant"
    : "smooth";
}

// ─────────────────────────────────────────────────────────────────────────────
// WS-16.7  ActivityFeed primitive — replaces 5 ad-hoc timeline feeds
// ─────────────────────────────────────────────────────────────────────────────

export type ActivityEntry = {
  id:        string;
  /** Who / what triggered the event. */
  actor:     string;
  /** Short past-tense sentence. */
  action:    string;
  /** ISO date string or relative label. */
  at:        string;
  /** Optional: pill/chip label (stage, status, etc.) */
  badge?:    string;
  badgeTone?: "green" | "amber" | "red" | "blue" | "ink";
  /** Optional secondary body — e.g. a quote or note. */
  detail?:   string;
  /** Optional icon name */
  icon?:     "mail" | "calendar" | "user" | "sparkle" | "info" | "bolt";
};

const BADGE_COLORS: Record<NonNullable<ActivityEntry["badgeTone"]>, { bg: string; color: string }> = {
  green: { bg: "rgba(16,185,129,0.10)", color: "#065F46" },
  amber: { bg: "rgba(245,158,11,0.10)", color: "#92400E" },
  red:   { bg: "rgba(220,38,38,0.10)",  color: "#991B1B" },
  blue:  { bg: "rgba(59,130,246,0.10)", color: "#1E40AF" },
  ink:   { bg: "rgba(11,11,13,0.06)",   color: "#1A1A2E"  },
};

export function ActivityFeed({
  entries,
  maxVisible = 8,
  onSeeAll,
  compact = false,
}: {
  entries:      ActivityEntry[];
  maxVisible?:  number;
  onSeeAll?:    () => void;
  compact?:     boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? entries : entries.slice(0, maxVisible);
  const hasMore = entries.length > maxVisible && !showAll;

  if (!entries.length) return null;

  return (
    <div style={{ fontFamily: FONTS.body }}>
      <div style={{ display: "flex", flexDirection: "column", gap: compact ? 0 : 2 }}>
        {visible.map((entry, idx) => {
          const badgeStyle = entry.badgeTone ? BADGE_COLORS[entry.badgeTone] : BADGE_COLORS.ink;
          return (
            <div
              key={entry.id}
              style={{
                display:       "flex",
                gap:           12,
                padding:       compact ? "8px 0" : "10px 12px",
                borderBottom:  idx < visible.length - 1 ? `1px solid ${COLORS.borderSoft}` : "none",
                alignItems:    "flex-start",
              }}
            >
              {/* Icon column */}
              <div style={{
                width: 28, height: 28, borderRadius: "50%",
                background: COLORS.surfaceAlt, border: `1px solid ${COLORS.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, marginTop: 1,
              }}>
                <Icon name={entry.icon ?? "bolt"} size={12} color={COLORS.inkMuted} />
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 12.5, color: COLORS.ink }}>{entry.actor}</span>
                  <span style={{ fontSize: 12.5, color: COLORS.inkMuted }}>{entry.action}</span>
                  {entry.badge && (
                    <span style={{
                      fontSize: 10.5, fontWeight: 700,
                      padding: "1px 6px", borderRadius: 999,
                      background: badgeStyle.bg, color: badgeStyle.color,
                    }}>
                      {entry.badge}
                    </span>
                  )}
                </div>
                {entry.detail && (
                  <div style={{
                    marginTop: 4, fontSize: 12, color: COLORS.inkMuted,
                    lineHeight: 1.5, fontStyle: "italic",
                  }}>
                    &ldquo;{entry.detail}&rdquo;
                  </div>
                )}
              </div>

              {/* Timestamp */}
              <span style={{ fontSize: 11, color: COLORS.inkMuted, flexShrink: 0, marginTop: 2 }}>
                {entry.at}
              </span>
            </div>
          );
        })}
      </div>

      {(hasMore || onSeeAll) && (
        <button
          type="button"
          onClick={hasMore ? () => setShowAll(true) : onSeeAll}
          style={{
            marginTop: 8, background: "none", border: "none", cursor: "pointer",
            fontSize: 12, color: COLORS.accent, fontFamily: FONTS.body, fontWeight: 600,
            padding: "4px 0",
          }}
        >
          {hasMore ? `Show ${entries.length - maxVisible} more` : "See full history →"}
        </button>
      )}
    </div>
  );
}
