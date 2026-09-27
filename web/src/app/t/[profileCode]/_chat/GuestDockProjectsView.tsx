"use client";

/**
 * GuestDockProjectsView — front-door brief DoR Yours: flat status-pill cards
 * (Draft / Awaiting / Replied / Offer / Booked). No Needs you / Waiting / Done
 * filter chips. Tap opens the thread; Book again stays on booked records.
 */

import { isBookAgainFulfilment } from "@/lib/messages-v5/guest-book-again";
import { useMemo } from "react";

import type { GuestInquirySummary } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import {
  guestStateLine,
  guestYoursPill,
  showSamePersonBanner,
  type GuestYoursPill,
} from "@/lib/messages-v5/guest-inquiries-view";

import { hasNewInbound } from "./guest-thread-switcher-helpers";
import { NewDot } from "./GuestThreadSwitcherParts";
import { FONT, paletteFor, type SurfaceMode } from "./mini-chat-styles";

export type GuestDockProjectsViewProps = {
  inquiries: GuestInquirySummary[];
  activeInquiryId: string | null;
  seenAtByInquiry: Record<string, string>;
  accent: string;
  agencyName: string;
  surfaceMode?: SurfaceMode;
  t: Translator;
  onSelect: (inquiryId: string) => void;
  /** Book again for a booked inquiry (token writer on the active thread). */
  onBookAgain?: (inquiryId: string) => void;
};

const PILL_KEYS: Record<GuestYoursPill, string> = {
  draft: "public.guestChat.dockYoursPillDraft",
  awaiting: "public.guestChat.dockYoursPillAwaiting",
  replied: "public.guestChat.dockYoursPillReplied",
  offer: "public.guestChat.dockYoursPillOffer",
  booked: "public.guestChat.dockYoursPillBooked",
};

/** A booked record (confirmed / fulfilled / seated / checked in) can be booked again (owner decision 13). */
function isBookedChip(chip: { fulfilmentState?: string | null } | null | undefined): boolean {
  return Boolean(chip && isBookAgainFulfilment(chip.fulfilmentState ?? null));
}

export function GuestDockProjectsView({
  inquiries,
  activeInquiryId,
  seenAtByInquiry,
  accent,
  agencyName,
  surfaceMode = "light",
  t,
  onSelect,
  onBookAgain,
}: GuestDockProjectsViewProps) {
  const C = paletteFor(surfaceMode);
  const samePerson = useMemo(() => showSamePersonBanner(inquiries), [inquiries]);
  const rows = useMemo(() => {
    return [...inquiries].sort((a, b) => {
      const ta = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const tb = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      return tb - ta;
    });
  }, [inquiries]);
  const labels = useMemo(
    () => ({
      needsReply: t("public.guestChat.dockInquiriesStateWaiting"),
      awaitingYou: t("public.guestChat.dockInquiriesStateYours"),
      pay: t("public.guestChat.dockInquiriesStatePay"),
      hold: t("public.guestChat.dockInquiriesStateHold"),
      offer: t("public.guestChat.dockInquiriesStateOffer"),
      done: t("public.guestChat.dockInquiriesStateDone"),
      draft: t("public.guestChat.dockInquiriesStateDraft"),
    }),
    [t],
  );

  return (
    <div
      data-guest-dock-view="projects"
      style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: C.surface }}
    >
      <div
        role="listbox"
        aria-label={t("public.guestChat.dockViewProjects")}
        style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "12px 12px 12px", display: "flex", flexDirection: "column", gap: 12 }}
      >
        {samePerson && (
          <div
            data-guest-dock-same-person
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: C.surfaceFaint,
              border: `1px dashed ${C.borderSoft}`,
              fontSize: 12,
              lineHeight: 1.4,
              color: C.inkMuted,
              fontFamily: FONT,
            }}
          >
            <div style={{ fontWeight: 700, color: C.ink, marginBottom: 2 }}>{t("public.guestChat.dockInquiriesSamePerson")}</div>
            {t("public.guestChat.dockInquiriesSamePersonBody")}
          </div>
        )}

        {rows.length === 0 && (
          <div
            data-guest-dock-yours-empty
            style={{
              marginTop: 6,
              padding: "14px 12px",
              borderRadius: 10,
              background: C.surfaceFaint,
              border: `1px dashed ${C.borderSoft}`,
              fontSize: 11.5,
              lineHeight: 1.45,
              color: C.inkDim,
              fontFamily: FONT,
            }}
          >
            {t("public.guestChat.dockInquiriesEmpty")}
          </div>
        )}

        {rows.map((inq) => {
          const isActive = inq.inquiryId === activeInquiryId;
          const showNew = !isActive && hasNewInbound(inq, seenAtByInquiry);
          const pill = guestYoursPill(inq);
          return (
            <div key={inq.inquiryId} style={{ display: "flex", flexDirection: "column" }}>
              <button
                type="button"
                role="option"
                aria-selected={isActive}
                aria-label={inq.projectLabel}
                data-guest-dock-inquiry={inq.inquiryId}
                data-guest-dock-yours-pill={pill}
                onClick={() => onSelect(inq.inquiryId)}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 6,
                  width: "100%",
                  textAlign: "left",
                  padding: "16px",
                  borderRadius: 18,
                  border: `1px solid ${isActive ? `${accent}66` : C.borderSoft}`,
                  background: isActive ? `${accent}0e` : C.surfaceFaint,
                  cursor: "pointer",
                }}
              >
                <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, minWidth: 0, fontFamily: FONT }}>
                  <span style={{ fontSize: 14, fontWeight: 500, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                    {inq.projectLabel}
                  </span>
                  {showNew && <NewDot accent={accent} />}
                  <span
                    data-guest-dock-status-pill={pill}
                    style={{
                      flexShrink: 0,
                      fontSize: 10,
                      fontWeight: 650,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: accent,
                      border: `1px solid ${C.borderSoft}`,
                      borderRadius: 999,
                      padding: "3px 7px",
                      fontFamily: FONT,
                    }}
                  >
                    {t(PILL_KEYS[pill])}
                  </span>
                </span>
                <span style={{ fontSize: 12.5, fontWeight: 300, color: C.inkMuted, fontFamily: FONT, lineHeight: 1.4 }}>
                  {guestStateLine(inq, labels).replace("{agency}", agencyName)}
                </span>
              </button>
              {isBookedChip(inq.recordChip) && onBookAgain ? (
                <button
                  type="button"
                  data-guest-dock-book-again={inq.inquiryId}
                  onClick={() => onBookAgain(inq.inquiryId)}
                  style={{ minHeight: 40, width: "100%", border: `1px solid ${C.borderSoft}`, borderRadius: 10, background: C.surface, color: accent, fontFamily: FONT, fontSize: 13, fontWeight: 600, cursor: "pointer", marginTop: 6 }}
                >
                  {t("public.guestChat.dockBookAgain")}
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
