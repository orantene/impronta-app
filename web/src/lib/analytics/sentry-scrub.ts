import { redactSecretPath } from "./redact-secret-path";
import { stripUrlQuery } from "./sanitize-url";

/** Query string and fragment removed, secret path segments redacted. */
export function scrubUrl(raw: unknown): string | undefined {
  if (typeof raw !== "string" || !raw) return undefined;
  const stripped = stripUrlQuery(raw);
  return stripped ? redactSecretPath(stripped) : undefined;
}

type Bag = Record<string, unknown>;

// No index signatures on purpose: Sentry's own ErrorEvent/Breadcrumb are interfaces,
// and an interface is not assignable to a type that demands `[k: string]: unknown`,
// which would make these helpers unusable as beforeSend/beforeBreadcrumb.
export type ScrubbableBreadcrumb = {
  category?: string;
  message?: string;
  data?: Bag;
};

export type ScrubbableEvent = {
  user?: { ip_address?: unknown };
  request?: {
    url?: string;
    query_string?: unknown;
    cookies?: unknown;
    headers?: Record<string, string>;
  };
  tags?: Record<string, unknown>;
  breadcrumbs?: ScrubbableBreadcrumb[];
};

const BREADCRUMB_URL_KEYS = ["from", "to", "url"];

export function scrubBreadcrumb<T extends ScrubbableBreadcrumb>(crumb: T): T {
  if (!crumb.data) return crumb;
  const data: Bag = { ...crumb.data };
  for (const k of BREADCRUMB_URL_KEYS) {
    const v = data[k];
    if (typeof v !== "string") continue;
    const clean = scrubUrl(v);
    if (clean) data[k] = clean;
    else delete data[k];
  }
  return { ...crumb, data };
}

export function scrubSentryEvent<T extends ScrubbableEvent>(event: T): T {
  if (event.user) delete event.user.ip_address;
  if (event.request) {
    delete event.request.cookies;
    delete event.request.query_string;
    if (event.request.url !== undefined) {
      const clean = scrubUrl(event.request.url);
      if (clean) event.request.url = clean;
      else delete event.request.url;
    }
    if (event.request.headers) {
      for (const k of Object.keys(event.request.headers)) {
        const lk = k.toLowerCase();
        if (lk === "authorization" || lk === "cookie") delete event.request.headers[k];
        else if (lk === "referer" || lk === "referrer") {
          const clean = scrubUrl(event.request.headers[k]);
          if (clean) event.request.headers[k] = clean;
          else delete event.request.headers[k];
        }
      }
    }
  }
  if (event.tags && typeof event.tags.route === "string") {
    event.tags.route = redactSecretPath(event.tags.route.split(/[?#]/)[0]);
  }
  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb);
  return event;
}
