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
 * The icons ARE the tab switchers (a second tap returns to Hablar). The tab
 * strip itself (GuestDockNav) shows only away from Hablar, so there is never
 * a duplicated control on the home view. Colours are `--cc-*` vars.
 */

import { Calendar, Maximize2, Minimize2 } from "lucide-react";
import type { CSSProperties } from "react";

import type { Translator } from "@/i18n/interpolate";
import type { MiniChatBrand } from "@/lib/inquiry/guest-chat-contract";
import type { ChatCardConfig } from "@/lib/talent-site/chat-card";

import type { GuestDockView } from "./guest-dock-view";
import type { GuestHeaderThreadState } from "./guest-thread-state";
import { StatusLine } from "./GuestPanelHeader";
import { CARD_PALETTE } from "./mini-chat-styles";
import type { UnifiedSyncState } from "./use-unified-inquiry";
import a11y from "./mini-chat-a11y.module.css";

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
  const subline = [card.replyLabel, card.city].filter(Boolean).join(" · ");
  const toggle = (view: GuestDockView) => onViewChange?.(activeView === view ? "chat" : view);
  const Expand = expanded ? Minimize2 : Maximize2;
  return (
    <div
      data-card-dock-header=""
      style={{
        padding: "14px 14px 10px",
        display: "flex",
        alignItems: "center",
        gap: 8,
        borderBottom: "1px solid var(--cc-line)",
        flex: "0 0 auto",
      }}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- tenant avatar URL, small
        <img src={photo} alt="" width={38} height={38} style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flex: "0 0 auto" }} />
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ display: "block", fontSize: 15, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</b>
        {threadState !== "new" ? (
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
          data-card-dock-bookings=""
          className={a11y.focusRing}
          style={ROUND_BTN}
        >
          <Calendar size={17} strokeWidth={1.8} aria-hidden />
          <Badge n={projectsCount} />
        </button>
      ) : null}
      {onToggleExpand ? (
        <button
          type="button"
          onClick={onToggleExpand}
          aria-label={expanded ? t("public.guestChat.menuCollapse") : t("public.guestChat.menuExpand")}
          data-card-dock-expand=""
          className={a11y.focusRing}
          style={ROUND_BTN}
        >
          <Expand size={16} strokeWidth={1.8} aria-hidden />
        </button>
      ) : null}
      <button type="button" onClick={onClose} aria-label={t("public.guestChat.closeAria")} className={a11y.focusRing} style={ROUND_BTN}>
        <XIcon />
      </button>
    </div>
  );
}
