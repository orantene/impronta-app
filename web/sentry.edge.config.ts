import * as Sentry from "@sentry/nextjs";
import {
  scrubBreadcrumb,
  scrubSentryEvent,
  type ScrubbableBreadcrumb,
  type ScrubbableEvent,
} from "@/lib/analytics/sentry-scrub";

const rate = Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "");

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0.1,
  sendDefaultPii: false,
  debug: false,
  // Scrubs in place; the cast only bridges the SDK event type to the scrubber's structural type.
  beforeSend: (event) => {
    scrubSentryEvent(event as unknown as ScrubbableEvent);
    return event;
  },
  beforeBreadcrumb: (crumb) =>
    scrubBreadcrumb(crumb as unknown as ScrubbableBreadcrumb) as unknown as typeof crumb,
});
