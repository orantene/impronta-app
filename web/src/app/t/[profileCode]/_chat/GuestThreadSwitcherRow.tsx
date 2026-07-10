"use client";

/**
 * ConversationRow — the vertical-list row used by DropdownSwitcher (5+
 * conversations) and the expanded 2-pane left-pane list. Extracted verbatim
 * from GuestThreadSwitcher.tsx (W1-A decomposition pre-pass) to keep that file
 * under the 800-line cap. No logic changes.
 */

import { FONT, paletteFor, readableOn, type SurfaceMode } from "./mini-chat-styles";
import { ReadonlyFaceStack } from "./ReadonlyFaceStack";
import type { GuestInquirySummary } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { AvatarCircle, NewDot, ProjectStatusPill } from "./GuestThreadSwitcherParts";
import { formatRelTime, hasNewInbound } from "./guest-thread-switcher-helpers";

export function ConversationRow({
  inq,
  isActive,
  accent,
  accentInk,
  onSelect,
  seenAtByInquiry,
  surfaceMode = "light",
  t,
}: {
  inq: GuestInquirySummary;
  isActive: boolean;
  accent: string;
  accentInk: string;
  onSelect: (id: string) => void;
  seenAtByInquiry: Record<string, string>;
  surfaceMode?: SurfaceMode;
  t: Translator;
}) {
  const C = paletteFor(surfaceMode);
  const showNew = !isActive && hasNewInbound(inq, seenAtByInquiry);
  // Phase 5: the face-stack reuses the launcher pill's lineup faces. When an
  // inquiry has no lineup yet (recommend-a-fit / message-the-agency draft), fall
  // back to a single agency-initial avatar so the row never reads empty.
  const hasLineup = inq.lineupCount > 0;
  const faceInk = readableOn(accent);

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      aria-label={`${inq.projectLabel}${showNew ? `, ${t("public.guestChat.switcherNewMessageSuffix")}` : ""}`}
      onClick={() => onSelect(inq.inquiryId)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 9,
        padding: "8px 12px",
        background: isActive ? `${accent}14` : "transparent",
        border: "none",
        cursor: "pointer",
        width: "100%",
        textAlign: "left",
        transition: "background 120ms",
      }}
    >
      {hasLineup ? (
        <ReadonlyFaceStack lineup={inq.lineup} ink={faceInk} P={C} t={t} diameter={32} />
      ) : (
        <AvatarCircle
          portraitUrl={inq.talentPortraitUrl}
          name={inq.talentName}
          accent={isActive ? accent : C.inkDim}
          accentInk={accentInk}
          size={32}
          active={isActive}
          C={C}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 12.5,
              fontWeight: isActive ? 700 : 500,
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
          <ProjectStatusPill isDraft={inq.isDraft} accent={accent} C={C} t={t} />
        </div>
        {inq.lastMessagePreview && (
          <div
            style={{
              fontSize: 11,
              color: C.inkMuted,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginTop: 1,
              fontFamily: FONT,
            }}
          >
            {inq.lastMessagePreview}
          </div>
        )}
        {/* Honest presence: ONLY real reply-time data, NEVER "Online now" */}
        {inq.typicalReplyLabel && (
          <div
            style={{
              fontSize: 10,
              color: C.inkDim,
              marginTop: 1,
              fontFamily: FONT,
            }}
          >
            {`Replies ${inq.typicalReplyLabel}`}
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: 10,
          color: C.inkDim,
          flexShrink: 0,
          fontFamily: FONT,
        }}
      >
        {formatRelTime(inq.lastMessageAt)}
      </div>
    </button>
  );
}
