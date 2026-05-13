"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import { forwardRef } from "react";

/**
 * IconButton — accessible primitive for icon-only buttons (D.7).
 *
 * Enforces the WCAG 4.1.2 / 2.5.5 rules for icon-only controls:
 *   - aria-label is required (TypeScript guards at compile time)
 *   - min 44×44 hit area by default (D.4)
 *   - native `title` mirrors aria-label so sighted hover users get the
 *     same label as screen-reader users
 *   - `disabled` propagates to aria-disabled
 *
 * Use this anywhere a button renders only an icon — close (×), pin,
 * archive, attach, emoji, mark-read, etc. Existing buttons can migrate
 * incrementally without behavior change.
 *
 * Example:
 *   <IconButton aria-label="Close" onClick={onClose}>
 *     <Icon name="x" size={14} />
 *   </IconButton>
 */
export type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & {
  "aria-label": string; // required — TS error if missing
  /** Override the native title (defaults to aria-label). */
  title?: string;
  /** Visual size — defaults to 44 (WCAG min touch target). */
  size?: number;
  children: ReactNode;
};

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    { "aria-label": ariaLabel, title, size = 44, children, style, disabled, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={ariaLabel}
        title={title ?? ariaLabel}
        disabled={disabled}
        aria-disabled={disabled || undefined}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: size,
          height: size,
          padding: 0,
          border: "none",
          background: "transparent",
          borderRadius: 10,
          cursor: disabled ? "not-allowed" : "pointer",
          color: "inherit",
          ...style,
        }}
        {...rest}
      >
        {children}
      </button>
    );
  },
);
