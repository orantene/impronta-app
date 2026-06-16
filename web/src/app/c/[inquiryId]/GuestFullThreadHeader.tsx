"use client";

/**
 * GuestFullThreadHeader — the branded top bar of the full-window guest
 * reading-room (U1). Extracted from GuestFullThreadView.tsx to keep that file
 * under the line cap. Pure presentational: a logo/accent avatar, the agency
 * name (+ optional talent name), the coarse thread status, and an HONEST
 * "Typically replies {fragment}" line built only from real server timestamps —
 * never a fake "online now".
 *
 * House rules: tenant accent (never black/gold), real portrait via logoUrl when
 * present, otherwise the accent circle (never a gray initials box).
 */

import {
  C,
  FONT,
  statusCopy as resolveStatusCopy,
  firstNameOf,
  readableOn,
} from "@/app/t/[profileCode]/_chat/mini-chat-styles";
import type { GuestThreadStatus } from "@/lib/inquiry/guest-chat-contract";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";

export type GuestFullThreadHeaderProps = {
  agencyName: string;
  talentDisplayName: string | null;
  accent: string;
  logoUrl: string | null;
  threadStatus: GuestThreadStatus;
  /** Bare fragment ("in ~2 hours"); the "Typically replies" prefix is owned here. */
  typicalReplyLabel: string | null;
  /** Guest UI locale (tenant default_locale). Falls back to "en". */
  locale?: string;
};

export function GuestFullThreadHeader({
  agencyName,
  talentDisplayName,
  accent,
  logoUrl,
  threadStatus,
  typicalReplyLabel,
  locale = "en",
}: GuestFullThreadHeaderProps) {
  const t = createTranslator(locale);
  const accentInk = readableOn(accent);
  // The avatar initial: agency name first, then talent — never empty.
  const initialSource = agencyName || talentDisplayName || "";
  const initial = firstNameOf(initialSource)[0]?.toUpperCase() ?? "•";

  // Secondary line: the live status once a thread exists, plus the honest reply
  // SLA when the server gave us one. Status always present; reply label optional.
  const statusCopy = resolveStatusCopy(threadStatus, t);
  const replyLine = typicalReplyLabel
    ? interpolate(t("public.guestChat.typicallyReplies"), { when: typicalReplyLabel })
    : null;

  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 13,
        padding: "16px 20px",
        borderBottom: `1px solid ${C.borderSoft}`,
        background: C.surfaceFaint,
        fontFamily: FONT,
      }}
    >
      <div
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: "50%",
          flexShrink: 0,
          background: logoUrl ? `center / cover no-repeat url(${logoUrl})` : accent,
          color: accentInk,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 17,
          fontWeight: 700,
          letterSpacing: 0.2,
        }}
      >
        {!logoUrl && initial}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 15.5,
            fontWeight: 700,
            color: C.ink,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {agencyName}
        </div>
        <div
          style={{
            fontSize: 12,
            color: C.inkMuted,
            marginTop: 2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {talentDisplayName ? (
            <>
              <span>{interpolate(t("public.guestChat.aboutTalent"), { name: talentDisplayName })}</span>
              <span style={{ color: C.inkDim }}> &middot; {statusCopy}</span>
            </>
          ) : (
            statusCopy
          )}
          {replyLine && <span style={{ color: C.inkDim }}> &middot; {replyLine}</span>}
        </div>
      </div>
    </header>
  );
}
