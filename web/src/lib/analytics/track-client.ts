"use client";

import type { ProductAnalyticsEventName, ProductAnalyticsPayload } from "./product-events";

function postInternal(name: ProductAnalyticsEventName, payload: ProductAnalyticsPayload) {
  if (typeof window === "undefined") return;
  const path = window.location?.pathname ?? null;
  // Promote `tenant_id` and `referrer` out of the payload into top-level body
  // fields the events route understands: `tenant_id` is written to the
  // analytics_events.tenant_id COLUMN (so per-tenant queries match), and
  // `referrer` is merged back into payload server-side for the top-referrers
  // grouping. Both stay best-effort/advisory (unauthenticated route).
  const tenantId =
    typeof payload.tenant_id === "string" && payload.tenant_id ? payload.tenant_id : undefined;
  const referrer =
    typeof payload.referrer === "string" && payload.referrer ? payload.referrer : undefined;
  // Same promotion for `talent_id` → the analytics_events.talent_id COLUMN.
  // Without it every per-talent query (demand ranking, profile analytics) sees
  // null; the server also falls back to payload.talent_id for older clients.
  const talentId =
    typeof payload.talent_id === "string" && payload.talent_id ? payload.talent_id : undefined;
  const body = JSON.stringify({
    name,
    payload,
    path,
    locale: typeof document !== "undefined" ? document.documentElement.lang || undefined : undefined,
    ...(tenantId ? { tenant_id: tenantId } : {}),
    ...(talentId ? { talent_id: talentId } : {}),
    ...(referrer ? { referrer } : {}),
  });
  void fetch("/api/analytics/events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    /* ignore */
  });
}

function sendGa4(name: ProductAnalyticsEventName, payload: ProductAnalyticsPayload) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  window.gtag("event", name, payload);
}

/**
 * Dual-write: GA4 (when gtag loaded + consent) and internal `analytics_events` via API.
 */
export function trackProductEvent(name: ProductAnalyticsEventName, payload: ProductAnalyticsPayload = {}) {
  sendGa4(name, payload);
  postInternal(name, payload);
}
