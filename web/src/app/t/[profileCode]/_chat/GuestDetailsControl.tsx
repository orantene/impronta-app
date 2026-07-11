"use client";

/**
 * GuestDetailsControl — DOCK v2 "Add details" affordance.
 *
 * Replaces the always-visible 6-chip detail row (the "too overwhelming" part).
 * Renders ONE slim button above the composer: a small icon + "Add details" with
 * a quiet progress hint (e.g. "2/6") when some fields are set. Tapping it opens
 * the GuestDetailsSheet (the list of fields + each field's existing editor + the
 * AI "Fill from conversation" scan). Owns only the open/close state so the panel
 * column stays lean.
 *
 * House rules: tenant accent only, dark-aware, no em dashes, inline styles.
 */

import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";

import type {
  GuestChipKind,
  GuestChipValue,
  ListGuestTenantRosterCallback,
  ScanGuestConversationCallback,
} from "@/lib/inquiry/guest-chat-contract";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";

import { GuestDetailsSheet } from "./GuestDetailsSheet";
import { countCoreDetails } from "./guest-detail-progress";
import { FONT, accentText, paletteFor, type SurfaceMode } from "./mini-chat-styles";

export type GuestDetailsControlProps = {
  intent: InquiryIntent;
  accent: string;
  accentInk: string;
  t: Translator;
  surfaceMode?: SurfaceMode;
  tenantSlug: string;
  capturedValues?: Partial<Record<GuestChipKind, GuestChipValue>>;
  onListRoster?: ListGuestTenantRosterCallback | null;
  onPatchChip: (kind: GuestChipKind, value: GuestChipValue) => void | Promise<void>;
  onTalentChange?: (
    selectedIds: string[],
    selectionMode: "i_know_who" | "agency_recommends",
    selectedNames: string[],
  ) => void;
  onBriefChange?: (summary: string) => void;
  onContactChange?: (value: { name: string; email: string; phone: string }) => void;
  onScanConversation?: ScanGuestConversationCallback | null;
  /** Unsent composer text, threaded down to the sheet's AI scan. */
  composerDraft?: string;
  inquiryId: string | null;
  /** Deep-link: open the sheet when the launcher points at a section. */
  openToSection?: "talent" | null;
  onConsumeOpenTo?: () => void;
  /**
   * DOCK v2.1 — controlled mode: the header's details icon owns the open
   * state; the in-column trigger bar is hidden and this control renders ONLY
   * the sheet. Uncontrolled (legacy) callers keep the slim pill trigger.
   */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
};

export function GuestDetailsControl({
  intent,
  accent,
  accentInk,
  t,
  surfaceMode = "light",
  tenantSlug,
  capturedValues = {},
  onListRoster = null,
  onPatchChip,
  onTalentChange,
  onBriefChange,
  onContactChange,
  onScanConversation = null,
  composerDraft = "",
  inquiryId,
  openToSection = null,
  onConsumeOpenTo,
  open: openProp,
  onOpenChange,
  hideTrigger = false,
}: GuestDetailsControlProps) {
  const C = paletteFor(surfaceMode);
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = openProp ?? uncontrolledOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setUncontrolledOpen(v);
  };
  const progress = countCoreDetails(intent, capturedValues);
  const hasProgress = progress.filled > 0;

  // Deep-link one-shot: the launcher's +N / empty-cart lead points at a section;
  // open the sheet and consume the intent so a manual close later sticks. The
  // consume callback is re-created each render, so it rides a ref and the effect
  // depends only on the section value (fires once per deep-link).
  const onConsumeRef = useRef(onConsumeOpenTo);
  useEffect(() => {
    onConsumeRef.current = onConsumeOpenTo;
  }, [onConsumeOpenTo]);
  useEffect(() => {
    if (!openToSection) return;
    setOpen(true);
    onConsumeRef.current?.();
  }, [openToSection]);

  return (
    <div
      style={
        hideTrigger
          ? { display: "contents" }
          : {
              borderTop: `1px solid ${C.borderSoft}`,
              background: C.surface,
              padding: "8px 12px 0",
              flexShrink: 0,
            }
      }
    >
      {!hideTrigger && (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          padding: "6px 11px",
          borderRadius: 999,
          border: `1px solid ${C.border}`,
          background: C.surfaceFaint,
          color: C.ink,
          cursor: "pointer",
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: 600,
        }}
      >
        <SlidersHorizontal size={13} strokeWidth={2.2} aria-hidden style={{ color: C.inkMuted }} />
        {t("public.guestChat.detailsAddCta")}
        {hasProgress && (
          <span
            aria-hidden
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "1px 6px",
              borderRadius: 999,
              background: `${accent}16`,
              color: accentText(accent, C.surfaceFaint),
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            {interpolate(t("public.guestChat.detailsProgress"), {
              filled: progress.filled,
              total: progress.total,
            })}
          </span>
        )}
      </button>
      )}

      <GuestDetailsSheet
        open={open}
        onClose={() => setOpen(false)}
        intent={intent}
        accent={accent}
        accentInk={accentInk}
        t={t}
        surfaceMode={surfaceMode}
        tenantSlug={tenantSlug}
        capturedValues={capturedValues}
        onListRoster={onListRoster}
        onPatchChip={onPatchChip}
        onTalentChange={onTalentChange}
        onBriefChange={onBriefChange}
        onContactChange={onContactChange}
        onScanConversation={onScanConversation}
        composerDraft={composerDraft}
        inquiryId={inquiryId}
      />
    </div>
  );
}
