"use client";

/**
 * Small presentational parts shared by the GuestThreadSwitcher layouts
 * (AvatarRail / ConversationRow / DropdownSwitcher): AvatarCircle, NewDot,
 * ProjectStatusPill. Extracted verbatim from GuestThreadSwitcher.tsx (W1-A
 * decomposition pre-pass) to keep that file under the 800-line cap. No logic
 * changes.
 */

import { FONT, type Palette } from "./mini-chat-styles";
import type { Translator } from "@/i18n/interpolate";
import { talentInitial } from "./guest-thread-switcher-helpers";

// ─────────────────────────────────────────────────────────────────────────────
// AvatarCircle
// ─────────────────────────────────────────────────────────────────────────────

export function AvatarCircle({
  portraitUrl,
  name,
  accent,
  accentInk,
  size,
  active,
  C,
}: {
  portraitUrl: string | null;
  name: string;
  accent: string;
  accentInk: string;
  size: number;
  active: boolean;
  C: Palette;
}) {
  const border = active ? `2.5px solid ${accent}` : `2px solid transparent`;

  if (portraitUrl) {
    return (
      <div
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: "50%",
          flexShrink: 0,
          overflow: "hidden",
          border,
          background: C.surfaceCool,
          position: "relative",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={portraitUrl}
          alt=""
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            display: "block",
          }}
        />
      </div>
    );
  }

  // Brand-accent circle with talent initial — the ONLY sanctioned non-photo
  // fallback (house rule: never a gray box).
  return (
    <div
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        flexShrink: 0,
        background: accent,
        color: accentInk,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.floor(size * 0.38),
        fontWeight: 700,
        letterSpacing: 0.2,
        border,
        fontFamily: FONT,
      }}
    >
      {talentInitial(name)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// NewDot
// ─────────────────────────────────────────────────────────────────────────────

export function NewDot({ accent }: { accent: string }) {
  return (
    <span
      aria-label="New message"
      style={{
        display: "inline-block",
        width: 7,
        height: 7,
        borderRadius: "50%",
        background: accent,
        flexShrink: 0,
        marginLeft: 3,
        verticalAlign: "middle",
      }}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ProjectStatusPill — distinguishes a private DRAFT from a SENT project that is
// awaiting a reply. Draft = neutral cool pill; sent = accent-tint.
// ─────────────────────────────────────────────────────────────────────────────

export function ProjectStatusPill({
  isDraft,
  accent,
  C,
  t,
}: {
  isDraft: boolean;
  accent: string;
  C: Palette;
  t: Translator;
}) {
  const label = isDraft
    ? t("public.guestChat.switcherDraftPill")
    : t("public.guestChat.switcherSentPill");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        fontSize: 9.5,
        fontWeight: 600,
        lineHeight: 1,
        padding: "3px 6px",
        borderRadius: 999,
        whiteSpace: "nowrap",
        fontFamily: FONT,
        background: isDraft ? C.surfaceCool : `${accent}1f`,
        color: isDraft ? C.inkMuted : accent,
        border: `1px solid ${isDraft ? C.borderSoft : `${accent}33`}`,
      }}
    >
      {!isDraft && (
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
      )}
      {label}
    </span>
  );
}
