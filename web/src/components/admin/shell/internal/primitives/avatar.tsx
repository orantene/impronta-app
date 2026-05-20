"use client";

// ─── Avatar ──────────────────────────────────────────────────────────
//
// Avatar primitive. Extracted from primitives.tsx — Phase 1f.
// `hashString` was inlined here from a sibling helper because Avatar is
// the only consumer.

import type { CSSProperties } from "react";
import { COLORS, FONTS } from "../state";

// djb2 hash. Tiny + deterministic — fine for choosing a tint.
function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) + s.charCodeAt(i);
  return Math.abs(h);
}

// ─── Avatar ──────────────────────────────────────────────────────────
//
// Real-photo seed: 20+ named talents/coordinators get a stable Pravatar
// URL keyed off their full name. When `Avatar` is rendered with a
// `hashSeed` (the convention everywhere — full name as seed), it
// auto-resolves to a real photo. Falls back to the existing initials +
// hashed-tone behavior for anyone unknown.
//
// Why Pravatar: free, deterministic, no API key, sized at 300px square,
// served via CDN. Stable img IDs mean the same name always gets the same
// face — important for QA so the user can tell people apart visually.
const PHOTO_BY_NAME: Record<string, string> = {
  // Talent (women)
  "Marta Reyes":        "https://i.pravatar.cc/300?img=5",
  "Lina Park":          "https://i.pravatar.cc/300?img=9",
  "Zara Habib":         "https://i.pravatar.cc/300?img=10",
  "Zara Hadid":         "https://i.pravatar.cc/300?img=10",
  "Iris Volpe":         "https://i.pravatar.cc/300?img=16",
  "Ana Vega":           "https://i.pravatar.cc/300?img=20",
  "Joana Rivera":       "https://i.pravatar.cc/300?img=23",
  "Joana R.":           "https://i.pravatar.cc/300?img=23",
  "Sara Bianchi":       "https://i.pravatar.cc/300?img=25",
  "Sara Mendez":        "https://i.pravatar.cc/300?img=26",
  "Sara M.":            "https://i.pravatar.cc/300?img=26",
  "Francesca Bianchi":  "https://i.pravatar.cc/300?img=29",
  "Elena Lombardi":     "https://i.pravatar.cc/300?img=32",
  // Talent (men)
  "Tomás Navarro":      "https://i.pravatar.cc/300?img=12",
  "Tomás Núñez":        "https://i.pravatar.cc/300?img=12",
  "Kai Lin":            "https://i.pravatar.cc/300?img=14",
  "Mario Rossi":        "https://i.pravatar.cc/300?img=33",
  "Aaron Park":         "https://i.pravatar.cc/300?img=51",
  "Daniel Ferrer":      "https://i.pravatar.cc/300?img=52",
  "Marco Pellegrini":   "https://i.pravatar.cc/300?img=60",
  "Oran Tene":          "https://i.pravatar.cc/300?img=11",
  "Orant Tenes":        "https://i.pravatar.cc/300?img=11",
};
function photoForName(name: string | undefined): string | undefined {
  if (!name) return undefined;
  // Try exact then a normalized lookup (drop trailing punctuation, etc.).
  return PHOTO_BY_NAME[name] ?? PHOTO_BY_NAME[name.replace(/[.,]+$/g, "")];
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
  // Avatar fallback hierarchy:
  //   1. Photo (when photoUrl given) — for real people
  //   2. Initials with deterministic tint per name — also for real people
  //   3. Emoji — only for non-person entities (brand, hub, system)
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
  // Auto-resolve a real photo from the prototype's name registry when
  // the caller used `hashSeed=<full name>` (the convention everywhere).
  // This lets every existing Avatar caller pick up real faces with
  // zero per-call changes.
  const resolvedPhoto = photoUrl ?? photoForName(hashSeed);
  if (resolvedPhoto) {
    return (
      <span
        aria-hidden
        style={{
          // display: inline-block — without this, span collapses to 0x0
          // because <span> is inline by default, which ignores width/height.
          // Was rendering empty rings everywhere a photo was supplied.
          display: "inline-block",
          width: size,
          height: size,
          borderRadius: "50%",
          backgroundImage: `url(${resolvedPhoto})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundColor: COLORS.surfaceAlt,
          flexShrink: 0,
        }}
      />
    );
  }
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
      {emoji ?? initials}
    </span>
  );
}

