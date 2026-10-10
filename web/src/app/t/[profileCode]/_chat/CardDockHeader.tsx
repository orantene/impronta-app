"use client";

/**
 * CardDockHeader: the card skin's header for the one guest dock. Photo, name
 * and an honest subline on the left; round icon buttons on the right:
 *
 *   ☰  Servicios  (badge = her selection)   toggles the Servicios tab
 *   📅  Mis citas  (badge = the visitor's bookings)   toggles the Mis citas tab
 *   ⤢  expand to full screen
 *   ✕  close
 *
 * The icons ARE the navigation (a second tap returns to Hablar); there is no
 * tab strip. Away from Hablar a slim "Back to chat" link (`CardDockBack`) sits
 * under the header. Expand shows on desktop only. Colours are `--cc-*` vars.
 */

import { Calendar, Maximize2, Minimize2 } from "lucide-react";
import { useState, useSyncExternalStore, type CSSProperties } from "react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type { MiniChatBrand } from "@/lib/inquiry/guest-chat-contract";
import type { ChatCardConfig } from "@/lib/talent-site/chat-card";

import type { GuestDockView } from "./guest-dock-view";
import type { GuestHeaderThreadState } from "./guest-thread-state";
import { StatusLine } from "./GuestPanelHeader";
import { CARD_PALETTE } from "./mini-chat-styles";
import type { UnifiedSyncState } from "./use-unified-inquiry";
import a11y from "./mini-chat-a11y.module.css";

const DESKTOP_QUERY = "(min-width: 900px)";
function subscribeDesktop(cb: () => void) {
  if (typeof window.matchMedia !== "function") return () => undefined;
  const mq = window.matchMedia(DESKTOP_QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function useIsDesktop(): boolean {
  return useSyncExternalStore(subscribeDesktop, () => typeof window.matchMedia !== "function" || window.matchMedia(DESKTOP_QUERY).matches, () => false);
}

/** The slim way back to Hablar from Servicios / Mis citas. */
export function CardDockBack({ label, onBack }: { label: string; onBack: () => void }) {
  return (
    <button
      type="button"
      data-card-dock-back=""
      onClick={onBack}
      className={a11y.focusRing}
      style={{ alignSelf: "flex-start", margin: "10px 16px 0", padding: "4px 0", border: 0, background: "transparent", color: "var(--cc-muted)", fontSize: 13, fontFamily: "var(--cc-font)", cursor: "pointer", flex: "0 0 auto" }}
    >
      {"\u2190"} {label}
    </button>
  );
}

/** One compact line: "1 servicio · falta el día" with a selection, the rail label alone before. */
export function CardDockRail({ count, label, t, onOpenDetails }: { count: number; label: string | null; t: Translator; onOpenDetails: (() => void) | null }) {
  // With nothing chosen yet the line is just the rail's own label: it stays the
  // way into the details sheet, as it is in the default skin.
  const tail = label ? label.charAt(0).toLowerCase() + label.slice(1) : "";
  const text = count <= 0 ? (label ?? "") : interpolate(t(count === 1 ? "public.guestChat.cardRailOne" : "public.guestChat.cardRailMany"), { count, label: tail }).replace(/ \u00b7 $/, "");
  return (
    <button
      type="button"
      data-card-dock-rail=""
      onClick={() => onOpenDetails?.()}
      disabled={!onOpenDetails}
      className={a11y.focusRing}
      style={{ alignSelf: "stretch", margin: "8px 16px 0", padding: "6px 12px", border: 0, borderRadius: 999, background: "var(--cc-bg)", color: "var(--cc-ink)", fontSize: 12.5, fontFamily: "var(--cc-font)", textAlign: "left", cursor: onOpenDetails ? "pointer" : "default", flex: "0 0 auto" }}
    >
      {text}
    </button>
  );
}

const ROUND_BTN: CSSProperties = {
  position: "relative",
  width: 38,
  height: 38,
  borderRadius: "50%",
  border: 0,
  background: "var(--cc-bg)",
  color: "var(--cc-ink)",
  display: "grid",
  placeItems: "center",
  flex: "0 0 auto",
  cursor: "pointer",
  padding: 0,
};

function Badge({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span
      aria-hidden
      data-card-dock-badge=""
      style={{
        position: "absolute",
        top: -3,
        right: -3,
        minWidth: 16,
        height: 16,
        padding: "0 4px",
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--cc-accent)",
        color: "var(--cc-on)",
        fontSize: 10,
        fontWeight: 700,
        boxShadow: "0 0 0 2px var(--cc-surface)",
      }}
    >
      {n}
    </span>
  );
}

function LinesIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M5 9h14M5 15h14" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Always present: the photo, or her initial when there is none or it fails to load. */
export function CardDockAvatar({ photo, name }: { photo: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const size: CSSProperties = { width: 38, height: 38, borderRadius: "50%", flex: "0 0 auto" };
  if (photo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- tenant avatar URL, small
      <img data-card-dock-avatar="" src={photo} alt="" width={38} height={38} onError={() => setFailed(true)} style={{ ...size, objectFit: "cover" }} />
    );
  }
  return (
    <span data-card-dock-avatar="" aria-hidden style={{ ...size, display: "grid", placeItems: "center", background: "var(--cc-accent)", color: "var(--cc-on)", fontWeight: 600, fontSize: 15 }}>
      {name.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function CardDockHeader({
  brand,
  card,
  t,
  activeView,
  onViewChange,
  showServices,
  servicesCount,
  projectsCount,
  threadState,
  syncState,
  onRetrySync,
  onOpenSwitcher,
  expanded,
  onToggleExpand,
  onClose,
}: {
  brand: MiniChatBrand;
  card: ChatCardConfig;
  t: Translator;
  activeView: GuestDockView;
  /** Absent when the dock tabs are off (no inquiry engine): only close shows. */
  onViewChange?: (view: GuestDockView) => void;
  showServices: boolean;
  servicesCount: number;
  projectsCount: number;
  threadState: GuestHeaderThreadState;
  syncState: UnifiedSyncState;
  onRetrySync?: () => void;
  onOpenSwitcher: (() => void) | null;
  expanded: boolean;
  onToggleExpand?: () => void;
  onClose: () => void;
}) {
  const name = brand.talentDisplayName || brand.agencyName;
  const photo = brand.photoUrl ?? brand.logoUrl ?? null;
  const subline = card.replyLabel ?? card.city ?? "";
  const desktop = useIsDesktop();
  const toggle = (view: GuestDockView) => onViewChange?.(activeView === view ? "chat" : view);
  const Expand = expanded ? Minimize2 : Maximize2;
  return (
    <div
      data-card-dock-header=""
      style={{
        padding: "14px 16px 12px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderBottom: "1px solid var(--cc-line)",
        flex: "0 0 auto",
      }}
    >
      <CardDockAvatar photo={photo} name={name} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: "block", fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</b>
        {threadState !== "new" || onOpenSwitcher ? (
          <StatusLine threadState={threadState} syncState={syncState} onRetrySync={onRetrySync} onOpenSwitcher={onOpenSwitcher} C={CARD_PALETTE} t={t} />
        ) : subline ? (
          <small style={{ fontSize: 12, color: "var(--cc-muted)" }}>{subline}</small>
        ) : null}
      </div>
      {onViewChange && showServices ? (
        <button
          type="button"
          onClick={() => toggle("lineup")}
          aria-pressed={activeView === "lineup"}
          aria-label={t("public.guestChat.cardServicesAria")}
          title={t("public.guestChat.cardServicesTip")}
          data-card-dock-services=""
          className={a11y.focusRing}
          style={ROUND_BTN}
        >
          <LinesIcon />
          <Badge n={servicesCount} />
        </button>
      ) : null}
      {onViewChange ? (
        <button
          type="button"
          onClick={() => toggle("projects")}
          aria-pressed={activeView === "projects"}
          aria-label={t("public.guestChat.cardBookingsAria")}
          title={t("public.guestChat.cardBookingsTip")}
          data-card-dock-bookings=""
          className={a11y.focusRing}
          style={ROUND_BTN}
        >
          <Calendar size={17} strokeWidth={1.8} aria-hidden />
          <Badge n={projectsCount} />
        </button>
      ) : null}
      {onToggleExpand && desktop ? (
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? t("public.guestChat.menuCollapse") : t("public.guestChat.menuExpand")}
          title={expanded ? t("public.guestChat.menuCollapse") : t("public.guestChat.menuExpand")}
          data-card-dock-expand=""
          className={a11y.focusRing}
          style={ROUND_BTN}
        >
          <Expand size={16} strokeWidth={1.8} aria-hidden />
        </button>
      ) : null}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label={t("public.guestChat.closeAria")}
        title={t("public.guestChat.closeAria")}
        className={a11y.focusRing}
        style={ROUND_BTN}
      >
        <XIcon />
      </button>
    </div>
  );
}
