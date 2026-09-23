/**
 * Talent theme gallery: server-action RESULT types (no runtime, no "use
 * server"), split out because `theme-actions.ts` may only export async
 * functions. The gallery UI imports the shape from here.
 */
import type { MaxSiteActionResult } from "./site-management-types";

type GateFailureCode = Extract<MaxSiteActionResult, { ok: false }>["code"];

export type ThemeActionErrorCode =
  | GateFailureCode
  /** TALENT_THEME_GALLERY_ENABLED is off. */
  | "feature_disabled"
  /** No published catalog row for that kind + slug. */
  | "theme_not_found"
  /** The row's required_talent_tier is above the caller's plan. */
  | "tier_required"
  /** The row failed publish-time validation (should never reach a talent). */
  | "invalid_theme"
  /** Theme publish lost the compare-and-swap on theme_version. */
  | "conflict";

export type ThemeActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; code: ThemeActionErrorCode; error: string };
