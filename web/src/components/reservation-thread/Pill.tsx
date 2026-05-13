/**
 * Pill — the single visual primitive used in the QuickStrip and in the
 * composer ActionRow. Compact, rounded, tone-aware.
 *
 * Two variants:
 *   - "strip" (default): label + status fragment, used in the QuickStrip.
 *   - "action": composer-area pill, larger touch target, emphasis-aware.
 */

"use client";
import type { CSSProperties, ReactNode } from "react";
import type { PillTone, ReservationPov } from "./types";
import { DENSITY, PALETTES, RADII, TYPE, pillToneColors } from "./tokens";

export interface PillProps {
  pov: ReservationPov;
  /** Visual variant — strip pills are 32px tall, action pills are 44px. */
  variant?: "strip" | "action";
  label: string;
  /** Right-side status fragment for strip pills, or null. */
  status?: string;
  tone?: PillTone;
  /** Action-pill emphasis. Ignored for strip pills. */
  emphasis?: "primary" | "secondary" | "danger";
  /** Optional badge dot (count). Shown to the right of the label. */
  badge?: number;
  /** Pending state — pill renders a subtle spinner. */
  pending?: boolean;
  disabled?: boolean;
  active?: boolean;
  onClick?: () => void;
  /** Optional leading icon. */
  leading?: ReactNode;
  /** Test hook. */
  dataTestid?: string;
}

export function Pill({
  pov,
  variant = "strip",
  label,
  status,
  tone,
  emphasis = "secondary",
  badge,
  pending = false,
  disabled = false,
  active = false,
  onClick,
  leading,
  dataTestid,
}: PillProps) {
  const palette = PALETTES[pov];
  const toneColors = pillToneColors(pov, tone);

  // Variant-specific geometry
  const isAction = variant === "action";
  const padX = isAction ? 16 : DENSITY.pillPadX;
  const padY = isAction ? 10 : DENSITY.pillPadY;
  const minH = isAction ? DENSITY.actionRowHeight : DENSITY.quickStripHeight - 4;
  const fontSize = isAction ? 13 : DENSITY.pillFontSize;

  // Action-pill emphasis → bg/fg/border
  const actionStyle = ((): { bg: string; fg: string; border: string } => {
    if (emphasis === "primary") {
      return { bg: palette.accent, fg: "#fff", border: palette.accent };
    }
    if (emphasis === "danger") {
      return { bg: palette.alertSoft, fg: palette.alert, border: palette.alertSoft };
    }
    return { bg: palette.surfaceRaised, fg: palette.ink, border: palette.border };
  })();

  // Strip-pill style: light surface, faint border, tone dot.
  const stripStyle = (() => {
    const bg = active ? palette.accentSoft : palette.surfaceRaised;
    const border = active ? palette.accent : palette.border;
    const fg = palette.ink;
    return { bg, fg, border };
  })();

  const colors = isAction ? actionStyle : stripStyle;

  const base: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: `${padY}px ${padX}px`,
    minHeight: minH,
    borderRadius: RADII.pill,
    background: colors.bg,
    color: colors.fg,
    border: `1px solid ${colors.border}`,
    fontFamily: TYPE.bodyFamily,
    fontSize,
    fontWeight: isAction ? 600 : 500,
    lineHeight: 1.2,
    cursor: disabled ? "not-allowed" : onClick ? "pointer" : "default",
    opacity: disabled ? 0.55 : 1,
    transition: "background 120ms, border-color 120ms, transform 120ms, box-shadow 120ms",
    whiteSpace: "nowrap",
    flexShrink: 0,
    // Stable touch target on mobile.
    WebkitTapHighlightColor: "transparent",
    userSelect: "none",
    // C6 a11y — let the browser's :focus-visible style win via outline.
    outline: "none",
  };

  return (
    <button
      type="button"
      onClick={disabled || pending ? undefined : onClick}
      disabled={disabled || pending}
      data-pill={variant}
      data-pill-tone={tone}
      data-pill-active={active || undefined}
      data-testid={dataTestid}
      style={base}
    >
      {/* Tone dot (strip pills only, when tone is set and not neutral) */}
      {variant === "strip" && tone && tone !== "neutral" && (
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: toneColors.fg,
            flexShrink: 0,
          }}
        />
      )}
      {leading && (
        <span aria-hidden style={{ display: "inline-flex", flexShrink: 0 }}>
          {leading}
        </span>
      )}
      <span>{label}</span>
      {status !== undefined && status !== "" && (
        <span
          style={{
            color: variant === "action" ? colors.fg : palette.inkMuted,
            fontVariantNumeric: "tabular-nums",
            fontWeight: 500,
          }}
        >
          {status}
        </span>
      )}
      {typeof badge === "number" && badge > 0 && (
        <span
          aria-label={`${badge} new`}
          style={{
            minWidth: 18,
            height: 18,
            padding: "0 5px",
            borderRadius: 999,
            background: palette.alert,
            color: "#fff",
            fontSize: 10,
            fontWeight: 700,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {pending && (
        <span
          aria-label="loading"
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            border: `2px solid ${colors.fg}`,
            borderTopColor: "transparent",
            animation: "rt-pill-spin 0.7s linear infinite",
            flexShrink: 0,
          }}
        />
      )}
      <style jsx>{`
        @keyframes rt-pill-spin {
          to { transform: rotate(360deg); }
        }
        /* C6 — keyboard-only focus ring. Mouse clicks don't trigger the
           ring (focus-visible is the modern browser-handled hint). */
        button:focus-visible {
          box-shadow: 0 0 0 2px ${palette.accent}, 0 0 0 4px ${palette.surface};
        }
      `}</style>
    </button>
  );
}
