"use client";

/**
 * chrome-icon-rail — primitives for the collapsed Layers/Navigator rail.
 *
 * When the floating Navigator panel is collapsed it shrinks to a tall, clean
 * white pill (Google-app-style): a drag grip at the top, a column of round
 * icon buttons, and a collaborator avatar pinned to the bottom. These two
 * primitives (`RailIconButton`, `RailAvatar`) keep that rail's JSX legible —
 * each carries its own hover affordance + a title tooltip, matching the
 * editor's CHROME token language.
 *
 * Only the collapsed navigator rail consumes these today; they're factored
 * out so a future tools rail can reuse the same look.
 */

import { useState, type ReactNode } from "react";

import { CHROME } from "./kit";

interface RailIconButtonProps {
  /** lucide icon (or any node) rendered centered in the button. */
  children: ReactNode;
  /** Tooltip + accessible label. */
  title: string;
  onClick?: () => void;
  /**
   * Primary action gets a faint persistent tint so the "expand" affordance
   * reads as the rail's main job even at rest.
   */
  primary?: boolean;
}

/**
 * A round 36px icon button for the collapsed rail. Transparent at rest (or a
 * faint accent tint when `primary`), with a soft hover fill so the column
 * feels tactile without borders.
 */
export function RailIconButton({
  children,
  title,
  onClick,
  primary = false,
}: RailIconButtonProps) {
  const [hovered, setHovered] = useState(false);
  const restBackground = primary ? "rgba(61, 79, 124, 0.10)" : "transparent";
  const restColor = primary ? CHROME.accent : CHROME.muted;
  return (
    <button
      type="button"
      data-no-drag
      onClick={onClick}
      title={title}
      aria-label={title}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        width: 36,
        height: 36,
        borderRadius: 12,
        border: "none",
        background: hovered
          ? primary
            ? "rgba(61, 79, 124, 0.16)"
            : "rgba(24, 24, 27, 0.06)"
          : restBackground,
        color: hovered ? (primary ? CHROME.accentInk : CHROME.ink2) : restColor,
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 120ms ease, color 120ms ease",
        padding: 0,
      }}
    >
      {children}
    </button>
  );
}

interface RailAvatarProps {
  /** 1–2 letter initials shown inside the circle. */
  initials?: string;
  title: string;
}

/**
 * A single static collaborator avatar pinned at the bottom of the collapsed
 * rail. Real presence (multiple live collaborators) is a later wave — for now
 * this is a decorative round chip with initials over the editor accent.
 */
export function RailAvatar({ initials = "You", title }: RailAvatarProps) {
  return (
    <div
      title={title}
      aria-label={title}
      style={{
        width: 28,
        height: 28,
        borderRadius: 9999,
        background: `linear-gradient(160deg, ${CHROME.accent2}, ${CHROME.accentInk})`,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.01em",
        boxShadow:
          "0 1px 2px rgba(17,24,39,0.18), inset 0 0 0 1.5px rgba(255,255,255,0.55)",
        userSelect: "none",
      }}
    >
      {initials}
    </div>
  );
}
