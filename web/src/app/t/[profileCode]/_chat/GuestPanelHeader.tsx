"use client";

/**
 * GuestPanelHeader — DOCK v2 slim identity row.
 *
 * The owner rejected the old two-row block (logo + agency name + a full "Private
 * draft" line). DOCK v2 collapses the header to ONE clean row:
 *
 *   [avatar] Agency name  ·  [lock chip when draft]  ·  [⋯ overflow]  [× close]
 *
 * No fake "online" dot (async-honest — omitted entirely; no real presence
 * signal). The draft state is a tiny inline lock chip (its accessible name keeps
 * the private-draft meaning + the save-state tail). The overflow ⋯ menu holds
 * secondary actions (Expand to the 2-pane view); Close stays a dedicated X.
 *
 * House rules: tenant accent only, editorial serif for the agency identity,
 * dark-variant-aware via the injected palette, no em dashes.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Lock, MoreHorizontal, Maximize2, Minimize2, SlidersHorizontal, X } from "lucide-react";

import type { Translator } from "@/i18n/interpolate";
import type { MiniChatBrand } from "@/lib/inquiry/guest-chat-contract";
import type { UnifiedSyncState } from "./use-unified-inquiry";
import { FONT, FONT_DISPLAY, type Palette, type SurfaceMode } from "./mini-chat-styles";

export type GuestPanelHeaderProps = {
  brand: MiniChatBrand;
  accent: string;
  accentInk: string;
  talentFirst: string;
  /** The resolved palette for the active surface mode (light/dark). */
  C: Palette;
  surfaceMode?: SurfaceMode;
  /** The inquiry is a private, un-sent draft — show the tiny lock chip. */
  isPrivateDraft?: boolean;
  /** Panel-level sync state, folded into the draft lock chip's accessible name. */
  syncState?: UnifiedSyncState;
  /** Re-run the last failed patch (the draft lock chip's error retry). */
  onRetrySync?: () => void;
  /** Toggle the 2-pane expanded layout (routed through the overflow menu). */
  onToggleExpand?: () => void;
  /** DOCK v2.1 — tap the title to open the in-chat thread switcher drawer. */
  onOpenSwitcher?: (() => void) | null;
  /** DOCK v2.1 — the header details icon (replaces the composer-area pill). */
  onOpenDetails?: (() => void) | null;
  detailsFilled?: number;
  detailsTotal?: number;
  /** Whether the panel is currently expanded (menu label + icon). */
  expanded?: boolean;
  t: Translator;
  onClose: () => void;
};

export function GuestPanelHeader({
  brand,
  accent,
  accentInk,
  talentFirst,
  C,
  isPrivateDraft = false,
  syncState = "idle",
  onRetrySync,
  onToggleExpand,
  expanded = false,
  onOpenSwitcher = null,
  onOpenDetails = null,
  detailsFilled = 0,
  detailsTotal = 6,
  t,
  onClose,
}: GuestPanelHeaderProps) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "11px 12px 11px 14px",
        borderBottom: `1px solid ${C.borderSoft}`,
        background: C.surfaceFaint,
        flexShrink: 0,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          flexShrink: 0,
          background: brand.logoUrl
            ? `center / cover no-repeat url(${brand.logoUrl})`
            : accent,
          color: accentInk,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        {!brand.logoUrl && (talentFirst[0]?.toUpperCase() ?? "•")}
      </div>

      {onOpenSwitcher ? (
        // The title doubles as the thread-switcher trigger: one tap overlays
        // the chat with the inquiry list (mobile-first switching).
        <button
          type="button"
          onClick={onOpenSwitcher}
          aria-haspopup="dialog"
          aria-label={t("public.guestChat.switchInquiryAria")}
          style={{
            minWidth: 0,
            flex: 1,
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            border: "none",
            background: "transparent",
            padding: 0,
            cursor: "pointer",
            fontFamily: FONT_DISPLAY,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: 0.1,
            color: C.ink,
            textAlign: "left",
          }}
        >
          <span
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {brand.agencyName}
          </span>
          <ChevronDown
            size={14}
            strokeWidth={2.4}
            aria-hidden
            style={{ flexShrink: 0, color: C.inkMuted }}
          />
        </button>
      ) : (
        <div
          style={{
            minWidth: 0,
            flex: 1,
            fontFamily: FONT_DISPLAY,
            fontSize: 15,
            fontWeight: 600,
            letterSpacing: 0.1,
            color: C.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {brand.agencyName}
        </div>
      )}

      {isPrivateDraft && (
        <DraftLockChip syncState={syncState} onRetry={onRetrySync} C={C} t={t} />
      )}

      {onOpenDetails && (
        // Event-details CTA: compact icon + live progress badge. The details
        // sheet itself is owned by the column (controlled GuestDetailsControl).
        <button
          type="button"
          onClick={onOpenDetails}
          aria-haspopup="dialog"
          aria-label={t("public.guestChat.detailsHeaderAria")}
          style={{ ...iconBtnStyle(C), position: "relative", color: C.ink }}
        >
          <SlidersHorizontal size={16} strokeWidth={2.2} aria-hidden />
          {detailsTotal > 0 && (
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: -2,
                right: -4,
                minWidth: 15,
                height: 15,
                padding: "0 3px",
                borderRadius: 999,
                background: accent,
                color: accentInk,
                fontSize: 8.5,
                fontWeight: 800,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
              }}
            >
              {detailsFilled}/{detailsTotal}
            </span>
          )}
        </button>
      )}

      {onToggleExpand && (
        <OverflowMenu
          C={C}
          t={t}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
        />
      )}

      <button
        type="button"
        onClick={onClose}
        aria-label={t("public.guestChat.closeAria")}
        style={iconBtnStyle(C)}
      >
        <X size={17} strokeWidth={2.2} aria-hidden />
      </button>
    </div>
  );
}

function iconBtnStyle(C: Palette) {
  return {
    width: 30,
    height: 30,
    borderRadius: 8,
    border: "none",
    background: "transparent",
    color: C.inkMuted,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    fontFamily: FONT,
  } as const;
}

/**
 * DraftLockChip — a tiny "private draft" pill. Its accessible name carries the
 * full meaning ("Draft. Only you can see this.") plus the save-state tail, so the
 * clean chip never loses the reassurance the old full-width banner gave.
 */
function DraftLockChip({
  syncState,
  onRetry,
  C,
  t,
}: {
  syncState: UnifiedSyncState;
  onRetry?: () => void;
  C: Palette;
  t: Translator;
}) {
  const isError = syncState === "error";
  const tail =
    syncState === "saving"
      ? t("public.guestChat.draftSaving")
      : syncState === "saved"
        ? t("public.guestChat.draftSaved")
        : isError
          ? t("public.guestChat.draftSaveError")
          : null;
  const accessibleName = `${t("public.guestChat.draftTitle")}${tail ? ` ${tail}` : ""}`;

  return (
    <button
      type="button"
      onClick={isError ? onRetry : undefined}
      aria-label={accessibleName}
      title={accessibleName}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        flexShrink: 0,
        height: 22,
        padding: "0 8px",
        borderRadius: 999,
        border: `1px solid ${isError ? C.danger : C.borderSoft}`,
        background: isError ? "rgba(161,58,58,0.06)" : C.surfaceCool,
        color: isError ? C.danger : C.inkMuted,
        fontFamily: FONT,
        fontSize: 10.5,
        fontWeight: 600,
        cursor: isError && onRetry ? "pointer" : "default",
      }}
    >
      <Lock size={10} strokeWidth={2.4} aria-hidden style={{ flexShrink: 0 }} />
      {t("public.guestChat.draftLockLabel")}
    </button>
  );
}

/** OverflowMenu — the ⋯ button that reveals secondary actions (Expand). A light
 *  controlled popover with an outside-click/Escape backdrop. */
function OverflowMenu({
  C,
  t,
  expanded,
  onToggleExpand,
}: {
  C: Palette;
  t: Translator;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("public.guestChat.moreActionsAria")}
        style={iconBtnStyle(C)}
      >
        <MoreHorizontal size={18} strokeWidth={2.2} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            right: 0,
            zIndex: 60,
            minWidth: 150,
            padding: 4,
            borderRadius: 10,
            border: `1px solid ${C.border}`,
            background: C.surface,
            boxShadow: "0 12px 30px -12px rgba(16,18,29,0.4)",
            fontFamily: FONT,
          }}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onToggleExpand();
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              padding: "8px 10px",
              borderRadius: 7,
              border: "none",
              background: "transparent",
              color: C.ink,
              cursor: "pointer",
              fontFamily: FONT,
              fontSize: 12.5,
              fontWeight: 500,
              textAlign: "left",
            }}
          >
            {expanded ? (
              <Minimize2 size={15} strokeWidth={2} aria-hidden style={{ color: C.inkMuted }} />
            ) : (
              <Maximize2 size={15} strokeWidth={2} aria-hidden style={{ color: C.inkMuted }} />
            )}
            {expanded
              ? t("public.guestChat.menuCollapse")
              : t("public.guestChat.menuExpand")}
          </button>
        </div>
      )}
    </div>
  );
}
