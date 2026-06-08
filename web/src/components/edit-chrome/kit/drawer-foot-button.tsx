"use client";

import type { ReactNode } from "react";

import { CHROME } from "./tokens";

export type DrawerFootButtonVariant = "secondary" | "primary";

interface DrawerFootButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: DrawerFootButtonVariant;
  type?: "button" | "submit";
  title?: string;
  "aria-label"?: string;
  "aria-busy"?: boolean;
}

/** Shared footer button styles for drawer primary/secondary actions. */
export function DrawerFootButton({
  children,
  onClick,
  disabled = false,
  variant = "secondary",
  type = "button",
  title,
  "aria-label": ariaLabel,
  "aria-busy": ariaBusy,
}: DrawerFootButtonProps) {
  const isPrimary = variant === "primary";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
      style={{
        height: 30,
        padding: isPrimary ? "0 14px" : "0 12px",
        fontSize: 12,
        fontWeight: isPrimary ? 600 : 500,
        color: isPrimary ? "#fff" : disabled ? CHROME.muted2 : CHROME.text2,
        background: isPrimary
          ? disabled
            ? CHROME.muted2
            : CHROME.accent
          : CHROME.surface,
        border: isPrimary ? "none" : `1px solid ${CHROME.lineMid}`,
        borderRadius: 7,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? (isPrimary ? 1 : 0.6) : 1,
        boxShadow: isPrimary && !disabled ? "0 1px 2px rgba(0,0,0,0.10)" : "none",
      }}
    >
      {children}
    </button>
  );
}
