"use client";

import type { CSSProperties } from "react";

/** Agenda V2 visual tokens (D1: charcoal primary + indigo accent). */
export const TC = {
  canvas: "#FAFAF7",
  surface: "#FFFFFF",
  ink: "#1A1A1A",
  muted: "rgba(0,0,0,0.55)",
  primary: "#1A1A1A",
  accent: "#3B4CCA",
  ok: "#1F7A4C",
  warn: "#B45309",
  risk: "#B42318",
  hold: "#5B5B5B",
  hatch: "repeating-linear-gradient(135deg,#e8e8e4 0 4px,#f3f3ef 4px 8px)",
} as const;

export const TALENT_AGENDA_VARS: CSSProperties = {
  ["--tc-accent" as string]: TC.accent,
  ["--tc-primary" as string]: TC.primary,
  ["--tc-canvas" as string]: TC.canvas,
  background: TC.canvas,
};

/** T9.2 Mobile tap targets — apply on agenda actions. */
export const AGENDA_TAP = "min-h-[44px] min-w-[44px]";
