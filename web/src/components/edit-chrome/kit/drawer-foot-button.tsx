"use client";

import type { ReactNode } from "react";

import { Button } from "./button";

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

/**
 * Shared footer button for drawer primary/secondary actions.
 *
 * W2-C2: this is now a thin alias over the ONE {@link Button} primitive so the
 * footer CTA can't drift from the rest of the chrome. The `variant` names map
 * straight through (primary/secondary). Kept as a named component because its
 * call sites read as "drawer foot button" and it pins the size/shape a footer
 * wants.
 */
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
  return (
    <Button
      variant={variant}
      size="md"
      onClick={onClick}
      disabled={disabled}
      type={type}
      title={title}
      aria-label={ariaLabel}
      aria-busy={ariaBusy}
    >
      {children}
    </Button>
  );
}
