"use client";

import type { ProductAnalyticsEventName, ProductAnalyticsPayload } from "./product-events";

function postInternal(name: ProductAnalyticsEventName, payload: ProductAnalyticsPayload) {
  if (typeof window === "undefined") return;
  const path = window.location?.pathname ?? null;
  const body = JSON.stringify({
    name,
    payload,
    path,
    locale: typeof document !== "undefined" ? document.documentElement.lang || undefined : undefined,
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
