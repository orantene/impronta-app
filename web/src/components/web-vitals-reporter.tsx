"use client";
import { improntaLog } from "@/lib/server/structured-log";

import { useReportWebVitals } from "next/web-vitals";

/**
 * Logs LCP, CLS, INP, etc. in development. Wire `metric` to analytics when
 * you add a provider (Vercel Analytics, custom endpoint).
 */
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    const value = Math.round(metric.value * 100) / 100;
    if (process.env.NODE_ENV === "development") {
      void 0;
      return;
    }
    if (metric.rating === "poor") {
      void improntaLog("web_vitals_reporter.info", {
        message: JSON.stringify({
          ns: "impronta",
          event: "web_vital_poor",
          name: metric.name,
          value,
          rating: metric.rating,
          ts: new Date().toISOString(),
        }),
      });
    }
  });
  return null;
}
