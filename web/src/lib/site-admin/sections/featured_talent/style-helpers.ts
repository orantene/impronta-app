/**
 * Pure presentation helpers for the featured_talent section.
 *
 * Extracted verbatim from `Component.tsx`, which sits ON its 800-line ratchet —
 * the same shape as `contact_form/style-helpers.ts` and
 * `directory/heading-sizes.ts`. No behaviour change: these were file-local and
 * are unchanged apart from the `export` keyword.
 */
import type { CSSProperties } from "react";

export function headingSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "clamp(1.55rem, 3.3vw, 2.4rem)";
  if (size === "lg") return "clamp(2.1rem, 4.8vw, 3.4rem)";
  if (size === "xl") return "clamp(2.4rem, 5.6vw, 3.9rem)";
  if (size === "display") return "clamp(3.5rem, 6vw, 6rem)";
  return undefined;
}

export function eyebrowSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.66rem";
  if (size === "lg") return "0.84rem";
  if (size === "xl" || size === "display") return "0.92rem";
  return undefined;
}

export function paragraphSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties["fontSize"] {
  if (size === "sm") return "0.95rem";
  if (size === "lg") return "1.1rem";
  if (size === "xl") return "1.2rem";
  if (size === "display") return "clamp(2rem, 4vw, 4.5rem)";
  return undefined;
}

export function visibilityDisplay(visibility?: "visible" | "hidden"): CSSProperties["display"] {
  if (visibility === "hidden") return "none";
  return undefined;
}

export function buttonSize(size?: "sm" | "md" | "lg" | "xl" | "display"): CSSProperties {
  if (size === "sm") return { padding: "0.5rem 0.85rem", fontSize: "0.78rem" };
  if (size === "lg") return { padding: "0.72rem 1.08rem", fontSize: "0.9rem" };
  if (size === "xl" || size === "display") return { padding: "0.82rem 1.2rem", fontSize: "0.94rem" };
  return {};
}

