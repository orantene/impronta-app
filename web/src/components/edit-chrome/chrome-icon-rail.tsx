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
 *
 * `RailPresenceStack` replaces the static single avatar when a
 * `PresenceProvider` is mounted above — it reads live collaborators from
 * `usePagePresence()` and renders them as overlapping 28px circles.
 */

import { useState, type ReactNode } from "react";

import { CHROME } from "./kit";
import { usePagePresence, type EditorPresence } from "./presence-provider";

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
 * Collaborator avatar for the collapsed rail.
 *
 * When a `PresenceProvider` is mounted above this component (i.e. the full
 * builder chrome is active), `RailAvatar` delegates to `RailPresenceStack` so
 * the rail foot automatically shows all live collaborators as overlapping 28px
 * circles without any changes to the call site (navigator-panel.tsx).
 *
 * When no provider is present, or the context returns only one editor (just
 * self), the classic single-circle avatar is rendered using the provided
 * `initials` / `title` props — keeping the existing static appearance.
 */
export function RailAvatar({ initials = "You", title }: RailAvatarProps) {
  const { editors } = usePagePresence();

  // More than one editor visible → show the live stack instead.
  if (editors.length > 1) {
    return <RailPresenceStack />;
  }

  // Single live editor: prefer their real initials from presence if available,
  // otherwise fall through to the static prop.
  const singleEditor = editors[0];
  const displayInitials = singleEditor ? singleEditor.initials : initials;
  const displayTitle = singleEditor ? singleEditor.name : title;

  return (
    <div
      title={displayTitle}
      aria-label={displayTitle}
      style={{
        width: 28,
        height: 28,
        borderRadius: 9999,
        background: singleEditor
          ? singleEditor.color
          : `linear-gradient(160deg, ${CHROME.accent2}, ${CHROME.accentInk})`,
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
      {displayInitials}
    </div>
  );
}

/** Internal single-editor circle used by `RailPresenceStack`. */
function StaticAvatar({
  initials,
  title,
}: {
  initials: string;
  title: string;
}) {
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

// ── Presence avatar ───────────────────────────────────────────────────────────

interface PresenceAvatarProps {
  editor: EditorPresence;
  /** Offset from the left for stacking. */
  offsetLeft: number;
  zIndex: number;
}

function PresenceAvatar({ editor, offsetLeft, zIndex }: PresenceAvatarProps) {
  const label = `${editor.name} (editing)`;
  return (
    <div
      title={label}
      aria-label={label}
      style={{
        position: "absolute",
        left: offsetLeft,
        top: 0,
        width: 28,
        height: 28,
        borderRadius: 9999,
        background: editor.color,
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.01em",
        boxShadow:
          "0 1px 2px rgba(17,24,39,0.20), inset 0 0 0 1.5px rgba(255,255,255,0.45)",
        outline: "2px solid rgba(255,255,255,0.80)",
        outlineOffset: -1,
        userSelect: "none",
        zIndex,
        transition: "left 200ms ease",
      }}
    >
      {editor.initials}
    </div>
  );
}

/**
 * Live collaborator presence stack for the collapsed rail.
 *
 * Reads editors from the nearest `PresenceProvider`. Shows up to 3 avatars
 * stacked with -8px overlap, plus a "+N" chip when more than 3 are active.
 * Falls back to the static `RailAvatar` when no providers are mounted or
 * the list is empty.
 */
export function RailPresenceStack() {
  const { editors } = usePagePresence();

  // If the context default (empty) is in play, or nobody is in the list,
  // fall back to the static placeholder.
  if (editors.length === 0) {
    return <StaticAvatar initials="You" title="You" />;
  }

  const MAX_SHOWN = 3;
  const shown = editors.slice(0, MAX_SHOWN);
  const overflow = editors.length - MAX_SHOWN;
  const OVERLAP = 8; // px each avatar slides over the previous
  const totalItems = shown.length + (overflow > 0 ? 1 : 0);
  // Total width of the stacked group so the container is sized correctly.
  const stackWidth = 28 + (totalItems - 1) * (28 - OVERLAP);

  const label = editors.map((e) => e.name).join(", ");

  return (
    <div
      aria-label={`Editing: ${label}`}
      title={`Editing: ${label}`}
      style={{
        position: "relative",
        width: stackWidth,
        height: 28,
        flexShrink: 0,
      }}
    >
      {shown.map((editor, i) => (
        <PresenceAvatar
          key={editor.id}
          editor={editor}
          offsetLeft={i * (28 - OVERLAP)}
          zIndex={shown.length - i}
        />
      ))}
      {overflow > 0 ? (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: shown.length * (28 - OVERLAP),
            top: 0,
            width: 28,
            height: 28,
            borderRadius: 9999,
            background: "rgba(42,49,71,0.72)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 9,
            fontWeight: 700,
            letterSpacing: "0.01em",
            boxShadow:
              "0 1px 2px rgba(17,24,39,0.20), inset 0 0 0 1.5px rgba(255,255,255,0.30)",
            outline: "2px solid rgba(255,255,255,0.80)",
            outlineOffset: -1,
            userSelect: "none",
            zIndex: 0,
          }}
        >
          +{overflow}
        </div>
      ) : null}
    </div>
  );
}
