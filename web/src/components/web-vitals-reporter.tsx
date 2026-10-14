"use client";

import * as Sentry from "@sentry/nextjs";
import { useReportWebVitals } from "next/web-vitals";

/**
 * Real-user Core Web Vitals (LCP, INP, CLS, FCP, TTFB) as Sentry metrics.
 * Sampled per page load at <= 10% so the cost stays about zero; no new vendor
 * and no Vercel Observability Plus. Attributes carry the rating and the
 * device class only (no URL, no PII).
 */
const SAMPLE_RATE = 0.1;

let sampled: boolean | null = null;
function isSampled(): boolean {
  if (sampled === null) sampled = Math.random() < SAMPLE_RATE;
  return sampled;
}

export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    if (process.env.NODE_ENV === "development" || !isSampled()) return;
    try {
      const mobile =
        typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches;
      Sentry.metrics.distribution(`web_vitals.${metric.name.toLowerCase()}`, metric.value, {
        unit: metric.name === "CLS" ? "none" : "millisecond",
        attributes: { rating: metric.rating, device: mobile ? "mobile" : "desktop" },
      });
    } catch {
      /* telemetry must never break the page */
    }
  });
  return null;
}
