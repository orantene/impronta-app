"use client";

// ─── Buttons ─────────────────────────────────────────────────────────
//
// PrimaryButton / SecondaryButton / GhostButton primitives.
// Extracted from primitives.tsx — Phase 1f decomposition.

import type { CSSProperties, ReactNode } from "react";
import { COLORS, FONTS, TRANSITION } from "../state";

export function PrimaryButton({
  onClick,
  children,
  type = "button",
  size = "md",
  disabled,
}: {
  onClick?: () => void;
  children: ReactNode;
  type?: "button" | "submit";
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const sizes: Record<typeof size, CSSProperties> = {
    sm: { padding: "7px 12px", fontSize: 12.5 },
    md: { padding: "9px 16px", fontSize: 13 },
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizes[size],
        fontFamily: FONTS.body,
        fontWeight: 500,
        background: COLORS.fill,
        color: "#fff",
        border: "1px solid transparent",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.38 : 1,
        letterSpacing: 0.1,
        transition: `background ${TRANSITION.sm}, transform ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        // Hover deepens the slate. Was "#1d1d20" (near-black) — flagged
        // repeatedly in feedback_admin_aesthetics as too-aggressive.
        if (!disabled) e.currentTarget.style.background = COLORS.fillDeep;
      }}
      onMouseLeave={(e) => {
        // Reset to the slate fill, NOT to COLORS.ink. Earlier this
        // reset to ink (#0B0B0D — pure black) which meant any hover
        // permanently turned the button black across the app.
        e.currentTarget.style.background = COLORS.fill;
        e.currentTarget.style.transform = "scale(1)";
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.98)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({
  onClick,
  children,
  size = "md",
  disabled,
}: {
  onClick?: () => void;
  children: ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
}) {
  const sizes: Record<typeof size, CSSProperties> = {
    sm: { padding: "7px 12px", fontSize: 12.5 },
    md: { padding: "9px 16px", fontSize: 13 },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        ...sizes[size],
        fontFamily: FONTS.body,
        fontWeight: 500,
        background: "#fff",
        color: COLORS.ink,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.38 : 1,
        transition: `border-color ${TRANSITION.sm}, transform ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.borderColor = "rgba(11,11,13,0.28)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.transform = "scale(1)";
      }}
      onMouseDown={(e) => { if (!disabled) e.currentTarget.style.transform = "scale(0.98)"; }}
      onMouseUp={(e) => { e.currentTarget.style.transform = "scale(1)"; }}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  onClick,
  children,
  size = "md",
  disabled,
  title,
}: {
  onClick?: () => void;
  children: ReactNode;
  size?: "sm" | "md";
  disabled?: boolean;
  title?: string;
}) {
  const sizes: Record<typeof size, CSSProperties> = {
    sm: { padding: "6px 10px", fontSize: 12.5 },
    md: { padding: "8px 12px", fontSize: 13 },
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        ...sizes[size],
        fontFamily: FONTS.body,
        fontWeight: 500,
        background: "transparent",
        color: COLORS.inkMuted,
        border: "1px solid transparent",
        borderRadius: 8,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "rgba(11,11,13,0.04)";
        e.currentTarget.style.color = COLORS.ink;
      }}
      onMouseLeave={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "transparent";
        e.currentTarget.style.color = COLORS.inkMuted;
      }}
    >
      {children}
    </button>
  );
}
