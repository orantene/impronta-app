"use client";

import type { CSSProperties } from "react";

/**
 * Talent dashboard color language. Mounted on the talent shell only.
 * `--tc-primary` is type. `--tc-action` is the only solid fill.
 * White on #3B8277 is 4.52:1, which clears WCAG AA at 13px, so the
 * concept teal is kept.
 */
export const TALENT_VISUAL = {
  canvas: "#F7F8FA",
  surface: "#FFFFFF",
  ink: "#26313B",
  muted: "#66717D",
  border: "#E6E9ED",
  action: "#3B8277",
  actionHover: "#326F66",
  /** Text on the soft tint. Darker than the fill so the label stays AA. */
  actionInk: "#245850",
  soft: "#E8F3F1",
  success: "#1F5C42",
  successSoft: "#E7F4EC",
  warning: "#8A5A12",
  warningSoft: "#F8F1E3",
  error: "#7A1F26",
  errorSoft: "#F8E8E6",
  info: "#245850",
  infoSoft: "#E8F3F1",
} as const;

export const TALENT_VISUAL_VARS: CSSProperties = {
  ["--tc-canvas" as string]: TALENT_VISUAL.canvas,
  ["--tc-surface" as string]: TALENT_VISUAL.surface,
  ["--tc-ink" as string]: TALENT_VISUAL.ink,
  ["--tc-muted" as string]: TALENT_VISUAL.muted,
  ["--tc-border" as string]: TALENT_VISUAL.border,
  ["--tc-primary" as string]: TALENT_VISUAL.ink,
  ["--tc-action" as string]: TALENT_VISUAL.action,
  ["--tc-action-hover" as string]: TALENT_VISUAL.actionHover,
  ["--tc-action-ink" as string]: TALENT_VISUAL.actionInk,
  ["--tc-soft" as string]: TALENT_VISUAL.soft,
  ["--tc-accent" as string]: TALENT_VISUAL.action,
  ["--tc-ok" as string]: TALENT_VISUAL.success,
  ["--tc-ok-soft" as string]: TALENT_VISUAL.successSoft,
  ["--tc-warn" as string]: TALENT_VISUAL.warning,
  ["--tc-warn-soft" as string]: TALENT_VISUAL.warningSoft,
  ["--tc-risk" as string]: TALENT_VISUAL.error,
  ["--tc-risk-soft" as string]: TALENT_VISUAL.errorSoft,
  ["--tc-info" as string]: TALENT_VISUAL.info,
  ["--tc-info-soft" as string]: TALENT_VISUAL.infoSoft,
  ["--tulala-primary-fill" as string]: TALENT_VISUAL.action,
  ["--tulala-primary-fill-deep" as string]: TALENT_VISUAL.actionHover,
  /** Selected mode pill. Agency falls back when this variable is absent. */
  ["--tc-mode-ring" as string]: `inset 0 0 0 1px ${TALENT_VISUAL.action}`,
};

/** The one solid action. Rare. */
export const talentActionClass =
  "border border-[var(--tc-action)] bg-[var(--tc-action)] font-semibold text-white hover:border-[var(--tc-action-hover)] hover:bg-[var(--tc-action-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tc-action)] disabled:cursor-not-allowed disabled:opacity-40";

/** Tabs, filters, fee choices. Never a solid fill. */
export const talentSelectedClass =
  "border border-[var(--tc-action)] bg-[var(--tc-soft)] font-semibold text-[var(--tc-ink)]";

/** Soft fill plus a text label. Defined in talent-visual.css. */
export const talentStatusClass = {
  info: "tc-status tc-status-info",
  ok: "tc-status tc-status-ok",
  warn: "tc-status tc-status-warn",
  risk: "tc-status tc-status-risk",
  neutral: "tc-status tc-status-neutral",
  muted: "tc-status tc-status-muted",
} as const;
