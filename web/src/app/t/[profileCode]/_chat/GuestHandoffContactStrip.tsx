"use client";

/**
 * Path B (booking sheet Contact → Hablar): name / WhatsApp / email land in
 * panel state via consumeBookingSheetChatHandoff, but the gate only mounts when
 * contact is *missing* at send time. Without this strip the guest never sees
 * that their details carried over — only the offering draft in the composer.
 */

import { paletteFor, type SurfaceMode } from "./mini-chat-styles";

export function GuestHandoffContactStrip({
  label,
  name,
  email,
  phone,
  surfaceMode = "light",
}: {
  readonly label: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string;
  readonly surfaceMode?: SurfaceMode;
}) {
  const parts = [name.trim(), phone.trim(), email.trim()].filter(Boolean);
  if (parts.length === 0) return null;
  const C = paletteFor(surfaceMode);
  return (
    <div
      data-guest-handoff-contact=""
      style={{
        padding: "8px 14px 0",
        display: "flex",
        flexDirection: "column",
        gap: 2,
        fontFamily: "inherit",
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: C.inkMuted }}>
        {label}
      </div>
      <div style={{ fontSize: 12.5, color: C.ink, lineHeight: 1.35 }}>{parts.join(" · ")}</div>
    </div>
  );
}
