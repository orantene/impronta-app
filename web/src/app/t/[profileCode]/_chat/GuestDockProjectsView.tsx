"use client";

/**
 * GuestDockProjectsView — F06 Inquiries list. Each row is name+time, subject,
 * ONE state line, ONE record chip with amount. Segments: Needs you / Waiting
 * on them / Done. "Same person?" is an informational banner (no merge writer).
 * Tap reuses the panel's thread-switch path.
 */

import { useMemo, useState } from "react";

import type { GuestInquirySummary } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import {
  guestInquirySegment,
  guestSegmentCounts,
  guestStateLine,
  showSamePersonBanner,
  type GuestInquirySegment,
} from "@/lib/messages-v5/guest-inquiries-view";

import { formatRelTime, hasNewInbound } from "./guest-thread-switcher-helpers";
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
};

const SEGMENTS: readonly GuestInquirySegment[] = ["needs", "wait", "done"];

function segmentLabel(seg: GuestInquirySegment, t: Translator): string {
  if (seg === "needs") return t("public.guestChat.dockInquiriesNeeds");
  if (seg === "wait") return t("public.guestChat.dockInquiriesWaiting");
  return t("public.guestChat.dockInquiriesDone");
}

function RecordChipView({
  chip,
  t,
  C,
  accent,
}: {
  chip: NonNullable<GuestInquirySummary["recordChip"]>;
  t: Translator;
  C: ReturnType<typeof paletteFor>;
  accent: string;
}) {
  const kindKey: Record<string, string> = {
    order: "public.guestChat.dockItemsRecordOrder",
    appointment: "public.guestChat.dockItemsRecordAppointment",
    reservation: "public.guestChat.dockItemsRecordReservation",
    class_enrolment: "public.guestChat.dockItemsRecordSession",
    tickets: "public.guestChat.dockItemsRecordTickets",
    project: "public.guestChat.dockItemsRecordProject",
    offer: "public.guestChat.dockItemsRecordOffer",
  };
  const label = kindKey[chip.kind] ? t(kindKey[chip.kind]) : chip.kind;
  const amount =
    chip.amountCents != null && chip.amountCents > 0
      ? formatOrderMoney(chip.amountCents, chip.currency || "USD")
      : null;
  return (
    <span
      data-guest-dock-record-chip={chip.kind}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 11,
        fontWeight: 600,
        fontFamily: FONT,
        color: accent,
        background: `${accent}14`,
        border: `1px solid ${accent}33`,
        borderRadius: 999,
        padding: "3px 8px",
        maxWidth: "100%",
      }}
    >
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
      {amount ? <span style={{ color: C.ink, fontVariantNumeric: "tabular-nums" }}>{amount}</span> : null}
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
  const [segment, setSegment] = useState<GuestInquirySegment>("needs");
  const counts = useMemo(() => guestSegmentCounts(inquiries), [inquiries]);
  const visible = useMemo(
    () => inquiries.filter((inq) => guestInquirySegment(inq) === segment),
    [inquiries, segment],
  );
  const samePerson = useMemo(() => showSamePersonBanner(inquiries), [inquiries]);
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
        role="tablist"
        aria-label={t("public.guestChat.dockViewProjects")}
        style={{ display: "flex", gap: 6, padding: "10px 12px 6px", flexShrink: 0 }}
      >
        {SEGMENTS.map((seg) => {
          const on = segment === seg;
          return (
            <button
              key={seg}
              type="button"
              role="tab"
              aria-selected={on}
              data-guest-dock-inquiries-seg={seg}
              onClick={() => setSegment(seg)}
              style={{
                flex: 1,
                fontSize: 11,
                fontWeight: 650,
                fontFamily: FONT,
                padding: "6px 4px",
                borderRadius: 999,
                border: `1px solid ${on ? accent : C.borderSoft}`,
                background: on ? `${accent}18` : C.surfaceFaint,
                color: on ? accent : C.inkMuted,
                cursor: "pointer",
              }}
            >
              {segmentLabel(seg, t)}
              {counts[seg] > 0 ? ` · ${counts[seg]}` : ""}
            </button>
          );
        })}
      </div>

      <div role="listbox" aria-label={t("public.guestChat.dockViewProjects")} style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "4px 12px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
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

        {visible.length === 0 && (
          <div
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
            {segment === "needs"
              ? t("public.guestChat.dockInquiriesEmptyNeeds")
              : segment === "wait"
                ? t("public.guestChat.dockInquiriesEmptyWait")
                : t("public.guestChat.dockInquiriesEmptyDone")}
          </div>
        )}

        {visible.map((inq) => {
          const isActive = inq.inquiryId === activeInquiryId;
          const showNew = !isActive && hasNewInbound(inq, seenAtByInquiry);
          const name = (inq.contactName ?? "").trim() || inq.projectLabel;
          return (
            <button
              key={inq.inquiryId}
              type="button"
              role="option"
              aria-selected={isActive}
              aria-label={inq.projectLabel}
              data-guest-dock-inquiry={inq.inquiryId}
              onClick={() => onSelect(inq.inquiryId)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "stretch",
                gap: 4,
                width: "100%",
                textAlign: "left",
                padding: "10px 12px",
                borderRadius: 12,
                border: `1px solid ${isActive ? `${accent}66` : C.borderSoft}`,
                background: isActive ? `${accent}0e` : C.surfaceFaint,
                cursor: "pointer",
              }}
            >
              <span style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, fontFamily: FONT }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                  {name}
                </span>
                {showNew && <NewDot accent={accent} />}
                <span style={{ fontSize: 10.5, color: C.inkDim, flexShrink: 0 }}>{formatRelTime(inq.lastMessageAt)}</span>
              </span>
              <span style={{ fontSize: 12, fontWeight: 550, color: C.inkMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: FONT }}>
                {inq.projectLabel}
              </span>
              <span style={{ fontSize: 11.5, color: C.inkDim, fontFamily: FONT }}>
                {guestStateLine(inq, labels).replace("{agency}", agencyName)}
              </span>
              {inq.recordChip ? <RecordChipView chip={inq.recordChip} t={t} C={C} accent={accent} /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
