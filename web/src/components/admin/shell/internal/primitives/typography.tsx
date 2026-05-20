"use client";

// ─── WS-0.6 Typography primitives ────────────────────────────────────
//
// Single source of truth for headings + meta text. Replaces the
// scattered inline-style `fontSize: 22, fontWeight: 500` instances
// across pages/drawers. Migration is gradual (WS-16.x sweep) but new
// surfaces use these from day 1.
//
// Extracted from primitives.tsx — Phase 1f decomposition.

import type { CSSProperties, ReactNode } from "react";
import { COLORS, FONTS } from "../state";

type TypographyProps = {
  children: ReactNode;
  /** Override color from semantic COLORS — defaults to ink. */
  color?: string;
  /** Pass through className for Tailwind users (we use inline-style here). */
  className?: string;
  /** Tighten line-height for dense layouts. */
  tight?: boolean;
  style?: CSSProperties;
};

export function H1({ children, color = COLORS.ink, tight, style }: TypographyProps) {
  return (
    <h1
      style={{
        fontFamily: FONTS.display,
        fontSize: 28,
        fontWeight: 500,
        letterSpacing: -0.4,
        color,
        margin: 0,
        lineHeight: tight ? 1.1 : 1.2,
        ...style,
      }}
    >
      {children}
    </h1>
  );
}

export function H2({ children, color = COLORS.ink, tight, style }: TypographyProps) {
  return (
    <h2
      style={{
        fontFamily: FONTS.display,
        fontSize: 22,
        fontWeight: 500,
        letterSpacing: -0.3,
        color,
        margin: 0,
        lineHeight: tight ? 1.15 : 1.25,
        ...style,
      }}
    >
      {children}
    </h2>
  );
}

export function H3({ children, color = COLORS.ink, tight, style }: TypographyProps) {
  return (
    <h3
      style={{
        fontFamily: FONTS.display,
        fontSize: 17,
        fontWeight: 500,
        letterSpacing: -0.15,
        color,
        margin: 0,
        lineHeight: tight ? 1.2 : 1.35,
        ...style,
      }}
    >
      {children}
    </h3>
  );
}

/** Small uppercase eyebrow above a heading. Sentence case kept lowercase
 * — content code uppercases via `text-transform`. */
export function Eyebrow({ children, color = COLORS.inkMuted, style }: TypographyProps) {
  return (
    <span
      style={{
        fontFamily: FONTS.body,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: 0.6,
        textTransform: "uppercase",
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Subordinate caption / meta line under a heading. */
export function Caption({ children, color = COLORS.inkMuted, style }: TypographyProps) {
  return (
    <p
      style={{
        fontFamily: FONTS.body,
        fontSize: 13,
        fontWeight: 400,
        color,
        margin: 0,
        lineHeight: 1.5,
        ...style,
      }}
    >
      {children}
    </p>
  );
}
