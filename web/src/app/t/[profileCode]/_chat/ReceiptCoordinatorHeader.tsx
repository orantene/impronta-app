"use client";

/**
 * ReceiptCoordinatorHeader — the humanized header subtitle for a SENT inquiry
 * (Jon Inquiry 360, Phase 2). Replaces the flat status word ("Open") in the
 * MiniChatPanel header once the inquiry has genuinely reached a coordinator.
 *
 * TIERED BY TRUTH, mirroring InquiryReceiptCard:
 *   • owningPartyCount > 1 (cross-agency GATE): a NEUTRAL line ("Coordinators
 *     from N teams"). No single agency name, no coordinator name/face.
 *   • single agency + coordinator: "{coordinator} . {agency}" + the coordinator
 *     face. Never a fake "online".
 *   • single agency, no coordinator: "{agency} . assigning a coordinator". NO
 *     placeholder face.
 *
 * House rules: tenant accent only (the face tint derives from the injected
 * accent token; never hardcoded gold), no em dashes, inline styles. The dot
 * separator is a literal middle dot, not an em dash.
 */

import { useState } from "react";

import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";
import type { InquiryReceiptData } from "@/lib/inquiry/guest-chat-contract";
import { C, FONT, accentText } from "./mini-chat-styles";
import { AVATAR_GROUND, FACE_OBJECT_POSITION, initialsOf } from "./launcher-avatar-styles";

export type ReceiptCoordinatorHeaderProps = {
  receipt: InquiryReceiptData;
  /** Brand display name — the single-agency fallback when receipt.agencyName null. */
  agencyName: string;
  accent: string;
  t: Translator;
};

export function ReceiptCoordinatorHeader({
  receipt,
  agencyName,
  accent,
  t,
}: ReceiptCoordinatorHeaderProps) {
  const resolvedAgency = receipt.agencyName?.trim() || agencyName;
  const isCrossAgency = receipt.owningPartyCount > 1;
  const subtitleStyle = {
    fontSize: 11,
    color: C.inkMuted,
    marginTop: 1,
    display: "flex",
    alignItems: "center",
    gap: 5,
    minWidth: 0,
  } as const;

  if (isCrossAgency) {
    return (
      <div style={subtitleStyle}>
        <span style={textStyle}>
          {interpolate(t("public.guestChat.headerCrossAgency"), {
            count: receipt.owningPartyCount,
          })}
        </span>
      </div>
    );
  }

  if (receipt.coordinator) {
    return (
      <div style={subtitleStyle}>
        <CoordinatorFace
          coordinator={receipt.coordinator}
          accent={accent}
        />
        <span style={textStyle}>
          {interpolate(t("public.guestChat.headerCoordinator"), {
            name: receipt.coordinator.displayName,
            agency: resolvedAgency,
          })}
        </span>
      </div>
    );
  }

  // No coordinator seated yet — say so plainly. NO placeholder face.
  return (
    <div style={subtitleStyle}>
      <span style={textStyle}>
        {interpolate(t("public.guestChat.headerAssigning"), {
          agency: resolvedAgency,
        })}
      </span>
    </div>
  );
}

function CoordinatorFace({
  coordinator,
  accent,
}: {
  coordinator: NonNullable<InquiryReceiptData["coordinator"]>;
  accent: string;
}) {
  const [failed, setFailed] = useState(false);
  const ink = accentText(accent, C.surfaceFaint);
  const showImage = Boolean(coordinator.avatarUrl) && !failed;
  return (
    <span
      aria-hidden
      style={{
        width: 18,
        height: 18,
        borderRadius: "50%",
        overflow: "hidden",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: showImage ? AVATAR_GROUND : `${accent}1f`,
        color: ink,
        font: "600 9px " + FONT,
        flexShrink: 0,
        border: "1px solid #ffffff",
        boxShadow: "0 0 0 1px rgba(20,24,31,0.1)",
      }}
    >
      {showImage ? (
        <img
          src={coordinator.avatarUrl ?? undefined}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: FACE_OBJECT_POSITION,
            display: "block",
          }}
        />
      ) : (
        initialsOf(coordinator.displayName)
      )}
    </span>
  );
}

const textStyle = {
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  minWidth: 0,
} as const;
