/**
 * inquiry-flags-tenant-slug — module-level bridge for the current tenant.
 *
 * The shell exposes the real tenant via the AdminShellProvider context
 * (`effectiveTenant.slug`), but a handful of helper functions live at
 * module scope — `togglePin`, `toggleManualUnread`, `archiveInquiry` —
 * because they double as the API surface for non-React code paths.
 * Hooks don't work at module scope, so those helpers need another way
 * to learn the current tenant slug.
 *
 * This module provides a tiny setter/getter pair:
 *
 *   • The shell calls `setInquiryFlagsTenantSlug(effectiveTenant.slug)`
 *     on every mount/identity change.
 *   • Module-level helpers call `getInquiryFlagsTenantSlug()` at the
 *     exact moment they need to persist a flag.
 *
 * Returns `null` before the shell has set it (e.g. on first paint or
 * in unit tests). Callers MUST null-check — the existing pattern is
 * `if (slug) void setInquiryPinned(slug, ...)` so a missing slug
 * degrades to local-only behavior, exactly how the previous
 * empty-string fallback did.
 *
 * Note: this is NOT a perfect substitute for context — if a user
 * switched tenants mid-session in the same tab, the next persist
 * call would use the OLD slug until the next render. The shell
 * doesn't support live tenant switching today, so this is moot.
 */

let currentTenantSlug: string | null = null;

export function setInquiryFlagsTenantSlug(slug: string | null): void {
  currentTenantSlug = slug;
}

export function getInquiryFlagsTenantSlug(): string | null {
  return currentTenantSlug;
}
