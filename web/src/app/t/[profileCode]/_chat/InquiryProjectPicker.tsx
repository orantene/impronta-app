"use client";

/**
 * InquiryProjectPicker — Phase 5 (multi-inquiry PROJECTS model) project picker.
 *
 * Surfaced when the inquiry-context resolver yields `pick_inquiry`: the viewer is
 * focused on a talent AND already has other open inquiries. Rather than silently
 * appending to whatever is in focus (or overwriting it), the picker lets the
 * client choose:
 *
 *   Add {firstName} to:
 *     • [project label · N talents · status]   → adds to that existing lineup
 *     • ...
 *   ─────────────────────────────────────────
 *   + Start a new inquiry with just {firstName} → PARKS the current lineup + seeds
 *                                                 a separate inquiry (never overwrite)
 *
 * It is an ANCHORED popover (useAnchoredPopover + PortaledOverlay) — NEVER a
 * blocking modal — so the client keeps full context. The most recent DRAFT is
 * default-highlighted (preserve > ask). Brand accent only; no gold/rust; dark-
 * aware; reduced-motion-safe (no transitions on the list, only a static popover).
 *
 * Self-contained: it renders its OWN trigger button (the add-to-project CTA) and
 * the anchored popover, so the host just drops it where the add affordance goes.
 * The picker consumes the resolver decision; it does not re-derive it. Adding to
 * an existing lineup and starting-new are injected as awaited callbacks so this
 * component imports no backend module.
 */

import { useMemo, useState } from "react";

import { useAnchoredPopover } from "@/components/edit-chrome/kit/use-anchored-popover";
import { PortaledOverlay } from "@/components/edit-chrome/kit/portaled-overlay";
import type { GuestInquirySummary } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";

import { FONT, paletteFor, readableOn, type SurfaceMode } from "./mini-chat-styles";
import { ReadonlyFaceStack } from "./ReadonlyFaceStack";

const POPOVER_WIDTH = 296;

export type InquiryProjectPickerProps = {
  /** First name of the focused talent, used throughout the copy. */
  firstName: string;
  /**
   * The client's other OPEN inquiries (the resolver's pick_inquiry set, enriched
   * to GuestInquirySummary so each row shows its lineup faces + project label +
   * status). Already excludes the focused talent's own active draft upstream.
   */
  openInquiries: GuestInquirySummary[];
  /** Add the focused talent to an existing inquiry's lineup. Awaited. */
  onAddToInquiry: (inquiryId: string) => Promise<{ ok: boolean }>;
  /** Park the current lineup + start a separate inquiry with just this talent. Awaited. */
  onStartNew: () => Promise<{ ok: boolean }>;
  accent: string;
  /** Optional label for the trigger button. Default "Add {name}". */
  triggerLabel?: string;
  /** Dark-aware. Default "light". */
  surfaceMode?: SurfaceMode;
  t: Translator;
};

export function InquiryProjectPicker({
  firstName,
  openInquiries,
  onAddToInquiry,
  onStartNew,
  accent,
  triggerLabel,
  surfaceMode = "light",
  t,
}: InquiryProjectPickerProps) {
  const C = paletteFor(surfaceMode);
  const accentInk = readableOn(accent);
  const [open, setOpen] = useState(false);
  const onClose = () => setOpen(false);
  const { triggerRef, popoverRef, position } = useAnchoredPopover<HTMLButtonElement, HTMLDivElement>({
    open,
    onClose,
    width: POPOVER_WIDTH,
    align: "left",
    gap: 6,
  });

  const [busyId, setBusyId] = useState<string | null>(null);

  // Default-highlight the most recent DRAFT (preserve > ask). openInquiries is
  // newest-first from the action; the first draft is the most recent one.
  const defaultDraftId = useMemo(
    () => openInquiries.find((i) => i.isDraft)?.inquiryId ?? null,
    [openInquiries],
  );

  const handleAdd = async (inquiryId: string) => {
    if (busyId) return;
    setBusyId(inquiryId);
    try {
      const res = await onAddToInquiry(inquiryId);
      if (res.ok) onClose();
    } finally {
      setBusyId(null);
    }
  };

  const handleStartNew = async () => {
    if (busyId) return;
    setBusyId("__new__");
    try {
      const res = await onStartNew();
      if (res.ok) onClose();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "8px 14px",
          borderRadius: 999,
          border: "none",
          background: accent,
          color: accentInk,
          fontSize: 13,
          fontWeight: 600,
          fontFamily: FONT,
          cursor: "pointer",
        }}
      >
        {triggerLabel ?? interpolate(t("public.guestChat.pickerTrigger"), { name: firstName })}
      </button>

      <PortaledOverlay open={open}>
      <div
        ref={popoverRef}
        role="menu"
        aria-label={interpolate(t("public.guestChat.pickerAria"), { name: firstName })}
        style={{
          position: "fixed",
          top: position?.top ?? -9999,
          left: position?.left ?? -9999,
          width: POPOVER_WIDTH,
          opacity: position ? 1 : 0,
          zIndex: 2147483000,
          background: C.surface,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          boxShadow: "0 12px 32px -8px rgba(16,18,29,0.32)",
          padding: 8,
          fontFamily: FONT,
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "4px 8px 6px",
            fontSize: 12.5,
            fontWeight: 700,
            color: C.ink,
          }}
        >
          {interpolate(t("public.guestChat.pickerAddTo"), { name: firstName })}
        </div>

        {/* Existing-inquiry rows */}
        <div role="group" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {openInquiries.map((inq) => {
            const isDefault = inq.inquiryId === defaultDraftId;
            const busy = busyId === inq.inquiryId;
            const statusLabel = inq.isDraft
              ? t("public.guestChat.pickerDraftStatus")
              : t("public.guestChat.pickerSentStatus");
            const countLabel = interpolate(
              inq.lineupCount === 1
                ? t("public.guestChat.pickerTalentOne")
                : t("public.guestChat.pickerTalentOther"),
              { count: inq.lineupCount },
            );
            return (
              <button
                key={inq.inquiryId}
                type="button"
                role="menuitem"
                disabled={Boolean(busyId)}
                aria-label={`${inq.projectLabel}, ${countLabel}, ${statusLabel}`}
                onClick={() => void handleAdd(inq.inquiryId)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 9,
                  padding: "8px 8px",
                  borderRadius: 10,
                  border: isDefault ? `1.5px solid ${accent}` : `1px solid ${C.borderSoft}`,
                  background: isDefault ? `${accent}12` : C.surfaceFaint,
                  cursor: busyId ? "default" : "pointer",
                  textAlign: "left",
                  width: "100%",
                  opacity: busyId && !busy ? 0.55 : 1,
                }}
              >
                {inq.lineupCount > 0 && (
                  <ReadonlyFaceStack
                    lineup={inq.lineup}
                    ink={accentInk}
                    P={C}
                    t={t}
                    diameter={28}
                    max={3}
                  />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      display: "block",
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: C.ink,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {inq.projectLabel}
                  </span>
                  <span style={{ fontSize: 11, color: C.inkMuted }}>
                    {countLabel}
                    {" · "}
                    {statusLabel}
                  </span>
                </span>
                <span
                  aria-hidden
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: busy ? C.inkDim : accent,
                    flexShrink: 0,
                  }}
                >
                  {busy ? t("public.guestChat.pickerAdding") : "+"}
                </span>
              </button>
            );
          })}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: C.borderSoft, margin: "8px 4px" }} />

        {/* Start a new (separate) inquiry — PARKS the current lineup */}
        <button
          type="button"
          role="menuitem"
          disabled={Boolean(busyId)}
          onClick={() => void handleStartNew()}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "9px 8px",
            borderRadius: 10,
            border: "none",
            background: "transparent",
            cursor: busyId ? "default" : "pointer",
            width: "100%",
            textAlign: "left",
            color: accent,
            fontSize: 12.5,
            fontWeight: 600,
            fontFamily: FONT,
            opacity: busyId && busyId !== "__new__" ? 0.55 : 1,
          }}
        >
          <span
            aria-hidden
            style={{
              width: 20,
              height: 20,
              borderRadius: "50%",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: `${accent}1f`,
              fontSize: 14,
              fontWeight: 700,
              flexShrink: 0,
            }}
          >
            +
          </span>
          {busyId === "__new__"
            ? t("public.guestChat.pickerStartingNew")
            : interpolate(t("public.guestChat.pickerStartNew"), { name: firstName })}
        </button>
      </div>
      </PortaledOverlay>
    </>
  );
}
