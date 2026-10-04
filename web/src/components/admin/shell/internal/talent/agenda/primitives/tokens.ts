"use client";

import type { CSSProperties } from "react";

import { TALENT_VISUAL, TALENT_VISUAL_VARS } from "../../visual/tokens";

/** Agenda V2 tokens. Ink is type. Action is the only solid fill. */
export const TC = {
  canvas: TALENT_VISUAL.canvas,
  surface: TALENT_VISUAL.surface,
  ink: TALENT_VISUAL.ink,
  muted: TALENT_VISUAL.muted,
  primary: TALENT_VISUAL.ink,
  action: TALENT_VISUAL.action,
  accent: TALENT_VISUAL.action,
  ok: TALENT_VISUAL.success,
  warn: TALENT_VISUAL.warning,
  risk: TALENT_VISUAL.error,
  hold: "#5B5B5B",
  hatch: "repeating-linear-gradient(135deg,#e8e8e4 0 4px,#f3f3ef 4px 8px)",
} as const;

export const TALENT_AGENDA_VARS: CSSProperties = {
  ...TALENT_VISUAL_VARS,
  background: TC.canvas,
};

/** T9.2 Mobile tap targets — apply on agenda actions. */
export const AGENDA_TAP = "min-h-[44px] min-w-[44px]";
