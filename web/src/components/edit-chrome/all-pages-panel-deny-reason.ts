/**
 * Pure plan-gate → copy mapping for the All Pages panel's "+ Add page"
 * control (W1-L6). Split out of all-pages-panel.tsx so the denial-reason
 * logic is unit-testable without a component harness.
 *
 * The server (`cmsAdditionalPageDeniedReason` in
 * `@/lib/site-admin/builder-capabilities`) is the source of truth for
 * WHETHER creation is denied and WHY; this module only decides what the
 * panel shows once that answer has come back over
 * `listPagesForPickerAction()` as `PagePickerAvailability`.
 */
import type { PagePickerAvailability } from "@/lib/server-actions/admin-site-pages-picker";

/** Shown when the server denied creation but sent no hint string (defensive — should not happen in practice). */
export const DEFAULT_ADD_PAGE_DENIAL_MESSAGE =
  "Your plan limits how many pages you can add. Upgrade to add more.";

/**
 * Returns the plain-language reason to show inline when "+ Add page" is
 * blocked by the workspace's plan, or `null` when there is nothing to show
 * (availability hasn't loaded yet, or the plan allows creating pages).
 */
export function resolveAddPageDenialMessage(
  availability: PagePickerAvailability | null,
): string | null {
  if (!availability || availability.canCreatePages) return null;
  return availability.createPageHint ?? DEFAULT_ADD_PAGE_DENIAL_MESSAGE;
}
