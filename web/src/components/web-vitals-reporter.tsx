"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * Logs LCP, CLS, INP, etc. in development. Wire `metric` to analytics when
 * you add a provider (Vercel Analytics, custom endpoint).
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const value = Math.round(metric.value * 100) / 100;
    if (process.env.NODE_ENV === "development") {
      console.debug(`[vitals] ${metric.name}`, value, metric.rating ?? "");
      return;
    }
    if (metric.rating === "poor") {
      console.info(
        JSON.stringify({
          ns: "impronta",
          event: "web_vital_poor",
          name: metric.name,
          value,
          rating: metric.rating,
          ts: new Date().toISOString(),
        }),
      );
    }
  });
  return null;
}
