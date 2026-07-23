/**
 * use-fly-to-rail-consts — tiny constant + helper module shared by the fly hook
 * and the FlyingAvatar clone, split out so neither file re-declares them and the
 * "use client" hook module stays focused on state.
 */

export {
  FLY_DURATION_MS,
  FLY_EASING,
  FLY_START_DIAMETER,
  FLY_ARC_APEX_PX,
  FLY_CLONE_Z,
  FACE_OBJECT_POSITION,
  AVATAR_GROUND,
  AVATAR_DIAMETER_DESKTOP,
  PERSON_SILHOUETTE_SVG,
  prefersReducedMotion,
} from "./launcher-avatar-styles";

/**
 * Fallback destination for the flight when the launcher ref is unmeasured.
 * Matches the pill's known fixed anchor (right: max(16px, safe), bottom:
 * GUEST_CHAT_LAUNCHER_BOTTOM_PX + safe) plus roughly half the pill so the clone
 * lands on the pill rather than the viewport corner. Approximate by design — the
 * real rect is preferred whenever the ref is available.
 */
export const GUEST_TARGET_FALLBACK_INSET = {
  right: 70,
  bottom: 156,
} as const;
