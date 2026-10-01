import * as Sentry from "@sentry/nextjs";

const rate = Number.parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE ?? "");

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: Number.isFinite(rate) && rate >= 0 && rate <= 1 ? rate : 0.1,
  sendDefaultPii: false,
  debug: false,
  beforeSend(event) {
    if (event.user) delete event.user.ip_address;
    if (event.request) {
      delete event.request.cookies;
      if (event.request.headers) {
        for (const k of Object.keys(event.request.headers)) {
          if (k.toLowerCase() === "authorization" || k.toLowerCase() === "cookie") {
            delete event.request.headers[k];
          }
        }
      }
    }
    return event;
  },
});
