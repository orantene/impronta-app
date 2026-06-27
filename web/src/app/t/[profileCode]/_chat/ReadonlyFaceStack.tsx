"use client";

/**
 * ReadonlyFaceStack — a non-interactive overlapping face-stack of an inquiry's
 * lineup (Phase 5 — multi-inquiry PROJECTS model). Shared by the thread-switcher
 * row and the project picker so a project's talents read as a face-stack
 * everywhere, mirroring the launcher pill's LauncherAvatarStack visual without
 * its per-avatar X-remove control (those surfaces are display-only).
 *
 * Newest-first reversal keeps the rightmost face fully exposed (same as the
 * launcher rail + the receipt lineup). Over the cap, a neutral "+N" chip takes
 * the deepest slot. Real portrait when present; accent/cool-surface initials
 * medallion otherwise (house rule: never a gray box). Dark-aware via the passed
 * palette. No motion — purely static, so it is reduced-motion-safe by design.
 */

import { useState } from "react";

import type { AvatarStackItem } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";

import {
  AVATAR_GROUND,
  FACE_OBJECT_POSITION,
  initialsOf,
} from "./launcher-avatar-styles";
import { FONT, type Palette } from "./mini-chat-styles";

export type ReadonlyFaceStackProps = {
  lineup: AvatarStackItem[];
  /** Readable ink for the initials medallion + the +N chip text. */
  ink: string;
  /** Surface palette (dark-aware). */
  P: Palette;
  t: Translator;
  /** Face diameter in px. Default 30 — sized for the switcher row. */
  diameter?: number;
  /** Max faces before the +N chip. Default 3. */
  max?: number;
  /** Overlap in px (negative). Default -10. */
  overlap?: number;
};

function faceBaseStyle(diameter: number, P: Palette) {
  return {
    width: diameter,
    height: diameter,
    borderRadius: "50%",
    overflow: "hidden",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: `1.5px solid ${P.surface}`,
    boxShadow: `0 0 0 1px ${P.borderSoft}`,
    flexShrink: 0,
  } as const;
}

function OneFace({
  face,
  diameter,
  ink,
  P,
}: {
  face: AvatarStackItem;
  diameter: number;
  ink: string;
  P: Palette;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(face.portraitUrl) && !failed;
  return (
    <span
      style={{
        ...faceBaseStyle(diameter, P),
        background: showImage ? AVATAR_GROUND : P.surfaceCool,
        color: ink,
        font: `600 ${Math.floor(diameter * 0.4)}px ${FONT}`,
      }}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={face.portraitUrl ?? undefined}
          alt={face.displayName}
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
        initialsOf(face.displayName)
      )}
    </span>
  );
}

export function ReadonlyFaceStack({
  lineup,
  ink,
  P,
  t,
  diameter = 30,
  max = 3,
  overlap = -10,
}: ReadonlyFaceStackProps) {
  if (lineup.length === 0) return null;

  const overflow = lineup.length - max;
  const hasOverflow = overflow > 0;
  const visible = hasOverflow ? lineup.slice(0, max - 1) : lineup.slice(0, max);
  // Newest-first reversal keeps the rightmost face fully exposed.
  const ordered = [...visible].reverse();

  const names = lineup.map((f) => f.displayName).join(", ");

  return (
    <ul
      role="list"
      aria-label={interpolate(t("public.guestChat.switcherLineupAria"), { names })}
      style={{
        display: "flex",
        flexDirection: "row-reverse",
        alignItems: "center",
        listStyle: "none",
        margin: 0,
        padding: 0,
        flexShrink: 0,
      }}
    >
      {hasOverflow && (
        <li style={{ marginLeft: overlap, zIndex: 0 }}>
          <span
            aria-label={interpolate(t("public.guestChat.switcherLineupMore"), {
              count: overflow,
            })}
            style={{
              ...faceBaseStyle(diameter, P),
              background: "rgba(20,24,31,0.55)",
              color: "#ffffff",
              font: `600 ${Math.floor(diameter * 0.36)}px ${FONT}`,
            }}
          >
            +{overflow}
          </span>
        </li>
      )}
      {ordered.map((face, i) => (
        <li
          key={face.talentProfileId}
          style={{
            marginLeft: i === ordered.length - 1 ? 0 : overlap,
            zIndex: ordered.length - i,
          }}
        >
          <OneFace face={face} diameter={diameter} ink={ink} P={P} />
        </li>
      ))}
    </ul>
  );
}
