"use client";

/**
 * Live "lo está viendo" line for Hablar. Renders ONLY when a staff peer is
 * present on the inquiry Realtime channel — never invents presence.
 */

import { interpolate, type Translator } from "@/i18n/interpolate";
import { useThreadPresence } from "@/lib/realtime/presence";

import { useGuestPresenceId } from "./use-guest-presence-id";
import { FONT, type Palette } from "./mini-chat-styles";

export function GuestStaffViewingLine({
  inquiryId,
  presenceName,
  C,
  t,
}: {
  inquiryId: string | null;
  presenceName: string;
  C: Palette;
  t: Translator;
}) {
  const guestId = useGuestPresenceId();
  const channelKey =
    inquiryId && guestId ? `inquiry:${inquiryId}:private` : null;
  const { peers } = useThreadPresence({
    channelKey,
    userId: guestId ?? "",
    displayName: "Guest",
    role: "guest",
  });
  // Messages v5 tracks as "staff"; classic shells default to "peer".
  const staffViewing = peers.some((p) => p.role === "staff" || p.role === "peer");
  const name = presenceName.trim();
  if (!staffViewing || !name) return null;

  return (
    <div
      role="status"
      data-guest-staff-viewing
      style={{
        textAlign: "center",
        color: C.inkMuted,
        fontSize: 11,
        fontFamily: FONT,
        margin: "4px 0",
      }}
    >
      {interpolate(t("public.guestChat.presenceViewing"), { name })}
    </div>
  );
}
