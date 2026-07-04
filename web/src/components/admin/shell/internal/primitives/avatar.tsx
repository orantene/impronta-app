"use client";

// ─── Avatar ──────────────────────────────────────────────────────────
//
// Avatar primitive. Extracted from primitives.tsx — Phase 1f.
// `hashString` was inlined here from a sibling helper because Avatar is
// the only consumer.

import { useState, type CSSProperties } from "react";
import { COLORS, FONTS } from "../state";

// djb2 hash. Tiny + deterministic — fine for choosing a tint.
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return Math.abs(h);
}

// ─── No-photo fallback ────────────────────────────────────────────────
//
// A person with no photo gets a premium, letter-free silhouette — never
// initials, never a name-in-a-box. The mark is a quiet line-art bust set
// at low opacity on a cool tonal ground. Real photos come ONLY from
// `photoUrl`; there is no synthetic stock-photo registry (removed — the
// old Pravatar seed was fake external imagery and CSP-fragile).
function PersonSilhouette({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={Math.round(size * 0.62)}
      height={Math.round(size * 0.62)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* Head + shoulders bust. Rounded, editorial, no facial detail. */}
      <circle cx="12" cy="8.2" r="3.6" fill={color} />
      <path
        d="M4.6 19.4c0-3.7 3.2-6.2 7.4-6.2s7.4 2.5 7.4 6.2c0 .5-.4.8-.9.8H5.5c-.5 0-.9-.3-.9-.8Z"
        fill={color}
      />
    </svg>
  );
}

export function Avatar({
  initials,
  size = 32,
  emoji,
  tone = "neutral",
  photoUrl,
  hashSeed,
}: {
  initials?: string;
  size?: number;
  emoji?: string;
  tone?: "neutral" | "ink" | "warm" | "auto";
  /** When provided wins over initials/emoji — actual photo. */
  photoUrl?: string;
  /**
   * String to hash for `tone="auto"`. Pass the full name (not just
   * initials) — initials collide far too often (TM vs TM is the same;
   * "Tom Marsh" vs "Talia Mendez" should pick different tints).
   */
  hashSeed?: string;
}) {
  // A broken/slow photoUrl must degrade to the silhouette, so track load
  // failure locally (an <img> onError, unlike a background-image, can tell
  // us the URL is dead).
  const [imgFailed, setImgFailed] = useState(false);
  // Avatar fallback hierarchy:
  //   1. Photo (when photoUrl given AND it loads) — for real people
  //   2. Line-art silhouette on a cool tonal ground — the no-photo person
  //   3. Emoji — only for non-person entities (brand, hub, system)
  // The `initials` prop is still accepted for back-compat but is no longer
  // rendered as the visible fallback (letters-in-a-box read as unfinished).
  // tone="auto" hashes the seed (full name, ideally) to pick a quiet
  // color. Forest-leaning, no warm gold/rust. Six tones to spread
  // collisions wider than the previous five.
  const autoTones: CSSProperties[] = [
    { background: "rgba(15,79,62,0.10)", color: COLORS.accentDeep },
    { background: "rgba(11,11,13,0.06)", color: COLORS.ink },
    { background: "rgba(46,125,91,0.10)", color: "#1F5C42" },
    { background: "rgba(82,96,109,0.10)", color: "#3A4651" },
    { background: COLORS.surfaceAlt, color: COLORS.ink },
    { background: "rgba(124,108,160,0.10)", color: "#4B3F66" },
    { background: "rgba(180,100,60,0.09)", color: "#7A3D1A" },
    { background: "rgba(40,100,160,0.09)", color: "#1A4A78" },
  ];
  const tones: Record<Exclude<typeof tone, "auto">, CSSProperties> = {
    neutral: { background: "rgba(11,11,13,0.06)", color: COLORS.ink },
    ink: { background: COLORS.fill, color: "#fff" },
    warm: { background: COLORS.surfaceAlt, color: COLORS.ink },
  };
  const resolved =
    tone === "auto"
      ? autoTones[hashString(hashSeed ?? initials ?? emoji ?? "x") % autoTones.length]!
      : tones[tone];
  // Real photos come ONLY from an explicit `photoUrl` — no synthetic
  // name→stock-photo registry. Render via <img> (not background-image) so a
  // dead/slow URL fires onError and degrades to the silhouette below. The
  // <img> is clipped to a circle directly (no wrapper span).
  if (photoUrl && !imgFailed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setImgFailed(true)}
        style={{
          display: "block",
          width: size,
          height: size,
          borderRadius: "50%",
          objectFit: "cover",
          objectPosition: "center",
          backgroundColor: COLORS.surfaceAlt,
          flexShrink: 0,
        }}
      />
    );
  }

  // Non-person entity explicitly given an emoji (brand / hub / system) →
  // render the emoji on the resolved tone. Everything else is a person with
  // no photo → the letter-free silhouette.
  const fillColor =
    tone === "ink"
      ? "rgba(255,255,255,0.82)"
      : "color-mix(in srgb, currentColor 42%, transparent)";
  return (
    <span
      style={{
        ...resolved,
        width: size,
        height: size,
        borderRadius: "50%",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONTS.body,
        fontSize: Math.round(size * 0.46),
        fontWeight: 600,
        letterSpacing: 0.3,
        flexShrink: 0,
        userSelect: "none",
      }}
    >
      {emoji ?? <PersonSilhouette size={size} color={fillColor} />}
    </span>
  );
}

