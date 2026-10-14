import * as Sentry from "@sentry/nextjs";
import { scrubBreadcrumb, scrubSentryEvent } from "@/lib/analytics/sentry-scrub";

const rate = Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "");

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0.1,
  sendDefaultPii: false,
  debug: false,
  beforeSend: scrubSentryEvent,
  beforeBreadcrumb: scrubBreadcrumb,
});
