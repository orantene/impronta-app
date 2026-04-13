"use client";

import { useReportWebVitals } from "next/web-vitals";

/**
 * Logs LCP, CLS, INP, etc. in development. Wire `metric` to analytics when
 * you add a provider (Vercel Analytics, custom endpoint).
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV === "development") {
      console.debug(
        `[vitals] ${metric.name}`,
        Math.round(metric.value * 100) / 100,
        metric.rating ?? "",
      );
    }
  });
  return null;
}
