/**
 * launcher-avatar-styles.ts — shared keyframes, geometry constants, and small
 * pure helpers for the Message-Impronta launcher avatar cart (plan §4.A).
 *
 * Split out of LauncherAvatarStack / FlyingAvatar so the rail and the
 * body-portal fly-clone share ONE keyframe block (and one face-crop technique)
 * and stay under the line cap. House rule: the only warm value is the injected
 * accent/accentInk; the +N chip and X control are intentionally neutral ink/
 * white (theme-independent system chips, per §4.A.11).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Geometry (plan §4.A.3 / exact-value table). One source of truth so the rail,
// the fly-clone, and the landing bounce all agree on diameters/overlap.
// ─────────────────────────────────────────────────────────────────────────────

export const AVATAR_DIAMETER_DESKTOP = 36;
export const AVATAR_DIAMETER_MOBILE = 32;
export const AVATAR_OVERLAP_DESKTOP = -12;
export const AVATAR_OVERLAP_MOBILE = -11;
export const MAX_AVATARS_DESKTOP = 3;
export const MAX_AVATARS_MOBILE = 2;

/** Face-focus crop — portrait thumbs put the face in the upper third (§4.A.2). */
export const FACE_OBJECT_POSITION = "50% 20%";

/** Empty-circle ground so an avatar is never an empty box (§4.A.2 / C.surfaceCool). */
export const AVATAR_GROUND = "#eef1f5";

/** Flying-clone z-index (plan §4.A.3 / exact-value table). */
export const FLY_CLONE_Z = 2147483001;

// Fly / bounce timing (plan §4.A.5 / exact-value table).
export const FLY_DURATION_MS = 520;
export const FLY_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
export const FLY_START_DIAMETER = 64;
export const FLY_ARC_APEX_PX = -40;
export const LANDING_DURATION_MS = 360;

// ─────────────────────────────────────────────────────────────────────────────
// Keyframes — injected once into <head> (mirrors NewMessagePulse's pattern so
// the convention is consistent across the _chat surface). Class names are
// deterministic, so multiple panels/instances share the single block safely.
// ─────────────────────────────────────────────────────────────────────────────

export const UIC = "uic";

const KEYFRAMES = `
@keyframes ${UIC}-land {
  0%   { transform: scale(0.42); }
  45%  { transform: scale(1.18); }
  70%  { transform: scale(0.94); }
  100% { transform: scale(1); }
}
@keyframes ${UIC}-leave {
  0%   { transform: scale(1); opacity: 1; }
  100% { transform: scale(0.4) translateY(6px); opacity: 0; }
}
@keyframes ${UIC}-appear {
  0%   { transform: scale(0.9); opacity: 0; }
  100% { transform: scale(1); opacity: 1; }
}
.${UIC}-avatar--landing { animation: ${UIC}-land ${LANDING_DURATION_MS}ms cubic-bezier(0.34,1.56,0.64,1) both; }
.${UIC}-avatar--leaving { animation: ${UIC}-leave 200ms cubic-bezier(0.4,0,1,1) both; pointer-events: none; }
.${UIC}-avatar--appear  { animation: ${UIC}-appear 180ms ease both; }
@media (prefers-reduced-motion: reduce) {
  /* No flight, no bounce — a new avatar fades+scales in over 180ms (§4.A.10);
     remove is an instant short fade with no translate. */
  .${UIC}-avatar--landing { animation: ${UIC}-appear 180ms ease both; }
  .${UIC}-avatar--leaving { animation: ${UIC}-appear 120ms ease reverse both; }
}
`;

let _injected = false;

/** Inject the avatar-cart keyframes into <head> once (no-op server-side). */
export function ensureAvatarKeyframes(): void {
  if (_injected) return;
  if (typeof document === "undefined") return;
  const style = document.createElement("style");
  style.setAttribute("data-uic-avatar-keyframes", "");
  style.textContent = KEYFRAMES;
  document.head.appendChild(style);
  _injected = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small pure helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Up-to-two-letter initials for the no-photo medallion fallback (§4.A.8). */
export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return (parts[0]?.[0] ?? "?").toUpperCase();
  return ((parts[0]?.[0] ?? "") + (parts[parts.length - 1]?.[0] ?? "")).toUpperCase();
}

/** True when the visitor prefers reduced motion (safe server-side → false). */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
