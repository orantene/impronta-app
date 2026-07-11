"use client";

/**
 * GuestDockProjectsView — Wave 2 (W2-A) "Projects" dock view: the guest's
 * inquiries as visually unmistakable project cards.
 *
 * Data is the existing listGuestInquiries summary (no new action): each card
 * shows the auto-generated project NAME (summary.projectLabel — the client's
 * job name, else the derived "Lineup of N · Jun 28"), an HONEST status chip
 * (Draft / Sent · awaiting {agency} / {agency} replied — deriveProjectPhase
 * over the same isDraft + threadStatus + last-author spine the resolver's
 * states key on), the newest guest-visible message's first line, and the
 * lineup's face row (ReadonlyFaceStack — the same faces as the switcher).
 *
 * Tapping a card reuses the panel's existing thread-switch path
 * (handleSwitchInquiry via onSelect) and hops the dock back to Chat.
 */

import { CalendarDays, Check, Lock, MapPin, Tag } from "lucide-react";

import type { GuestInquirySummary } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";

import { deriveProjectPhase, type GuestProjectPhase } from "./guest-dock-view";
import { formatRelTime, hasNewInbound } from "./guest-thread-switcher-helpers";
import { NewDot } from "./GuestThreadSwitcherParts";
import { ReadonlyFaceStack } from "./ReadonlyFaceStack";
import { FONT, paletteFor, readableOn, type SurfaceMode } from "./mini-chat-styles";

export type GuestDockProjectsViewProps = {
  inquiries: GuestInquirySummary[];
  activeInquiryId: string | null;
  seenAtByInquiry: Record<string, string>;
  accent: string;
  agencyName: string;
  surfaceMode?: SurfaceMode;
  t: Translator;
  /** Switch the panel to this inquiry's thread (the existing switch path). */
  onSelect: (inquiryId: string) => void;
};

function phaseChip(
  phase: GuestProjectPhase,
  agencyName: string,
  accent: string,
  C: ReturnType<typeof paletteFor>,
  t: Translator,
) {
  const base = {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 9.5,
    fontWeight: 600,
    lineHeight: 1,
    padding: "3px 7px",
    borderRadius: 999,
    whiteSpace: "nowrap",
    fontFamily: FONT,
  } as const;

  if (phase === "draft") {
    return (
      <span
        style={{
          ...base,
          background: C.surfaceCool,
          color: C.inkMuted,
          border: `1px solid ${C.borderSoft}`,
        }}
      >
        <Lock size={9} strokeWidth={2.4} aria-hidden style={{ flexShrink: 0 }} />
        {t("public.guestChat.dockStatusDraft")}
      </span>
    );
  }
  if (phase === "booked") {
    // Confirmed booking — the strongest chip on the card: solid accent fill.
    const ink = readableOn(accent);
    return (
      <span style={{ ...base, background: accent, color: ink, border: `1px solid ${accent}` }}>
        <Check size={9} strokeWidth={3} aria-hidden style={{ flexShrink: 0 }} />
        {t("public.guestChat.dockStatusBooked")}
      </span>
    );
  }
  if (phase === "replied") {
    return (
      <span
        style={{
          ...base,
          background: `${accent}22`,
          color: accent,
          border: `1px solid ${accent}44`,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 5,
            height: 5,
            borderRadius: "50%",
            background: accent,
            display: "inline-block",
          }}
        />
        {interpolate(t("public.guestChat.dockStatusReplied"), { agency: agencyName })}
      </span>
    );
  }
  return (
    <span
      style={{
        ...base,
        background: `${accent}12`,
        color: accent,
        border: `1px solid ${accent}2e`,
      }}
    >
      {interpolate(t("public.guestChat.dockStatusSent"), { agency: agencyName })}
    </span>
  );
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
}: GuestDockProjectsViewProps) {
  const C = paletteFor(surfaceMode);
  const faceInk = readableOn(accent);

  if (inquiries.length === 0) {
    return (
      <div
        data-guest-dock-view="projects"
        style={{ flex: 1, minHeight: 0, overflowY: "auto", background: C.surface }}
      >
        <div
          style={{
            margin: 14,
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
          {t("public.guestChat.dockProjectsEmpty")}
        </div>
      </div>
    );
  }

  return (
    <div
      data-guest-dock-view="projects"
      role="listbox"
      aria-label={t("public.guestChat.dockViewProjects")}
      style={{
        flex: 1,
        minHeight: 0,
        overflowY: "auto",
        background: C.surface,
        padding: "10px 12px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {inquiries.map((inq) => {
        const isActive = inq.inquiryId === activeInquiryId;
        const showNew = !isActive && hasNewInbound(inq, seenAtByInquiry);
        const phase = deriveProjectPhase(inq);
        return (
          <button
            key={inq.inquiryId}
            type="button"
            role="option"
            aria-selected={isActive}
            aria-label={inq.projectLabel}
            onClick={() => onSelect(inq.inquiryId)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "stretch",
              gap: 6,
              width: "100%",
              textAlign: "left",
              padding: "10px 12px",
              borderRadius: 12,
              border: `1px solid ${isActive ? `${accent}66` : C.borderSoft}`,
              background: isActive ? `${accent}0e` : C.surfaceFaint,
              cursor: "pointer",
              transition: "background 120ms, border-color 120ms",
            }}
          >
            {/* Row 1: project name + status chip */}
            <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: C.ink,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: FONT,
                  flex: "0 1 auto",
                  minWidth: 0,
                }}
              >
                {inq.projectLabel}
              </span>
              {showNew && <NewDot accent={accent} />}
              <span style={{ marginLeft: "auto", flexShrink: 0 }}>
                {phaseChip(phase, agencyName, accent, C, t)}
              </span>
            </span>

            {/* Row 2: newest guest-visible message preview */}
            {inq.lastMessagePreview && (
              <span
                style={{
                  fontSize: 11.5,
                  color: C.inkMuted,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: FONT,
                }}
              >
                {inq.lastMessagePreview}
              </span>
            )}

            {/* Row 2.5: quick-summary meta — date · place · budget, icons only
                where a value exists. Server pre-localizes the labels. */}
            {(inq.eventDateLabel || inq.locationLabel || inq.budgetLabel) && (
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "4px 10px",
                  fontSize: 10.5,
                  color: C.inkMuted,
                  fontFamily: FONT,
                }}
              >
                {inq.eventDateLabel && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <CalendarDays size={11} strokeWidth={2.2} aria-hidden style={{ flexShrink: 0, opacity: 0.75 }} />
                    {inq.eventDateLabel}
                  </span>
                )}
                {inq.locationLabel && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                    <MapPin size={11} strokeWidth={2.2} aria-hidden style={{ flexShrink: 0, opacity: 0.75 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {inq.locationLabel}
                    </span>
                  </span>
                )}
                {inq.budgetLabel && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <Tag size={11} strokeWidth={2.2} aria-hidden style={{ flexShrink: 0, opacity: 0.75 }} />
                    {inq.budgetLabel}
                  </span>
                )}
              </span>
            )}

            {/* Row 3: lineup faces + relative time */}
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {inq.lineupCount > 0 && (
                <ReadonlyFaceStack lineup={inq.lineup} ink={faceInk} P={C} t={t} diameter={26} />
              )}
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  color: C.inkDim,
                  fontFamily: FONT,
                  flexShrink: 0,
                }}
              >
                {formatRelTime(inq.lastMessageAt)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
