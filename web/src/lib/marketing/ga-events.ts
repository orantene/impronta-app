/**
 * Minimal, dependency-free GA4 event dispatch for marketing conversion
 * points (Task 3.3 — key events).
 *
 * Deliberately separate from `@/lib/analytics/track-client`'s
 * `trackProductEvent` (which dual-writes to GA4 + the internal
 * `analytics_events` table under a locked `ProductAnalyticsEventName`
 * union). The events fired here are meant to be marked as GA4 "key events"
 * (sign_up, talent_modal_open, get_started_submit) and don't need an
 * internal-table row, so this stays a thin, direct `window.gtag` wrapper.
 *
 * Safe no-op when gtag hasn't loaded yet (consent denied, script blocked,
 * SSR) — never throws.
 */
export function trackEvent(name: string, params: Record<string, unknown> = {}) {
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("event", name, params);
  }
}
