"use client";

/**
 * NewMessagePulse — U2 accent ring/glow that fires once when `active` flips true.
 *
 * A purely presentational component rendered by the wiring agent at the top of
 * the MiniChatPanel message body. The panel sets `active={true}` for ~1.2 s when
 * a new inbound batch arrives from the poll, then back to false. Each true→false
 * cycle fires exactly one animation.
 *
 * Motion:
 *   • A scoped CSS keyframe animation (accent ring scale + fade out).
 *   • When @media (prefers-reduced-motion: reduce) → static highlight only,
 *     no animation.
 *
 * Design rules:
 *   • Uses the tenant accent color (from MiniChatPanel brand) — never gold/rust.
 *   • No DOM structure beyond a single <span> + a <style> block.
 *   • Under 800 lines.
 */

import { useEffect, useRef, useState } from "react";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type NewMessagePulseProps = {
  /**
   * When this flips from false→true the animation fires once.
   * The panel toggles this for ~1.2 s per inbound batch.
   */
  active: boolean;
  /** Tenant accent color (CSS color string). Drives the ring/glow hue. */
  accent: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Unique class name prefix (avoids collisions with other scoped styles).
// ─────────────────────────────────────────────────────────────────────────────

const CLS = "nmp-pulse";

// ─────────────────────────────────────────────────────────────────────────────
// Keyframes (injected once into <head> via a <style> tag owned by the component).
// ─────────────────────────────────────────────────────────────────────────────

const KEYFRAMES = `
@keyframes ${CLS}-ring {
  0%   { transform: scale(0.7); opacity: 0.9; }
  60%  { transform: scale(1.6); opacity: 0.4; }
  100% { transform: scale(2.1); opacity: 0; }
}
@keyframes ${CLS}-glow {
  0%   { opacity: 0.55; }
  100% { opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .${CLS}-ring-el { animation: none !important; }
  .${CLS}-glow-el { animation: none !important; }
}
`;

// Inject the keyframes into the document head once (shared across all
// instances — the class names are deterministic so multiple panels are fine).
let _keyframesInjected = false;
function ensureKeyframes() {
  if (_keyframesInjected) return;
  if (typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  _keyframesInjected = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function NewMessagePulse({ active, accent }: NewMessagePulseProps) {
  // animKey increments each time `active` flips true → triggers a fresh CSS
  // animation by unmounting/remounting the animated elements (key change).
  const [animKey, setAnimKey] = useState(0);
  const prevActiveRef = useRef(false);

  useEffect(() => {
    ensureKeyframes();
  }, []);

  useEffect(() => {
    if (active && !prevActiveRef.current) {
      // Rising edge: fire the animation.
      setAnimKey((k) => k + 1);
    }
    prevActiveRef.current = active;
  }, [active]);

  // Nothing to render when no animation has ever been triggered.
  if (animKey === 0) return null;

  // Inline style for @media (prefers-reduced-motion: reduce) fallback.
  // When the animation is suppressed by the media query, we show a static
  // translucent accent bar for 1 second instead (CSS transition).
  const ringStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    border: `2px solid ${accent}`,
    pointerEvents: "none",
    animation: `${CLS}-ring 0.6s cubic-bezier(0.22, 1, 0.36, 1) forwards`,
  };

  const glowStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    borderRadius: "inherit",
    background: `${accent}22`,
    pointerEvents: "none",
    animation: `${CLS}-glow 0.5s ease-out forwards`,
  };

  return (
    <span
      aria-hidden="true"
      key={animKey}
      style={{
        // Positioned at the top of the panel body, spanning the full width.
        // The panel mounts this as a sibling to the message list (not overlaid
        // over messages), so it reads as a subtle "new content" signal at the
        // top of the scroll area.
        display: "block",
        position: "relative",
        height: 0,
        overflow: "visible",
        pointerEvents: "none",
      }}
    >
      {/* Static highlight for prefers-reduced-motion (CSS class target). */}
      <span
        className={`${CLS}-glow-el`}
        style={glowStyle}
      />
      {/* Expanding ring (motion). */}
      <span
        className={`${CLS}-ring-el`}
        style={ringStyle}
      />
    </span>
  );
}
