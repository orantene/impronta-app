import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecretPath } from "./redact-secret-path";
import { scrubBreadcrumb, scrubSentryEvent, type ScrubbableEvent } from "./sentry-scrub";
import { buildGaPageLocation, buildGaReferrer } from "./ga-location";

test("redactor replaces secret segments", () => {
  assert.equal(redactSecretPath("/invite/abc123"), "/invite/:token");
  assert.equal(redactSecretPath("/r/XY9"), "/r/:code");
  assert.equal(redactSecretPath("/ticket/ZZ/pay"), "/ticket/:code/pay");
  assert.equal(redactSecretPath("/visit/tok"), "/visit/:token");
  assert.equal(redactSecretPath("/api/calendar/feed/tok"), "/api/calendar/feed/:token");
  assert.equal(redactSecretPath("/es/invite/abc"), "/es/invite/:token");
  assert.equal(redactSecretPath("https://a.com/invite/abc?x=1"), "https://a.com/invite/:token?x=1");
  assert.equal(redactSecretPath("/directory"), "/directory");
  assert.equal(redactSecretPath("/invite"), "/invite");
});

test("event scrubber strips query, url secrets, route tag, breadcrumbs", () => {
  const ev: ScrubbableEvent = {
    user: { ip_address: "1.2.3.4" },
    request: {
      url: "https://x.com/invite/sekret?token=abc#f",
      query_string: "token=abc",
      cookies: { a: "b" },
      headers: { Cookie: "a=b", Referer: "https://y.com/p?code=1" },
    },
    tags: { route: "/r/CODE?x=1" },
    breadcrumbs: [
      { category: "navigation", data: { from: "/a?x=1", to: "/ticket/AB?y=2" } },
      { category: "fetch", data: { url: "https://x.com/api?k=v", status_code: 200 } },
      { category: "ui.click", message: "btn" },
    ],
  };
  const out = scrubSentryEvent(ev);
  assert.equal(out.user?.ip_address, undefined);
  assert.equal(out.request?.url, "https://x.com/invite/:token");
  assert.equal(out.request?.query_string, undefined);
  assert.equal(out.request?.cookies, undefined);
  assert.equal(out.request?.headers?.Cookie, undefined);
  assert.equal(out.request?.headers?.Referer, "https://y.com/p");
  assert.equal(out.tags?.route, "/r/:code");
  assert.equal(out.breadcrumbs?.[0].data?.from, "/a");
  assert.equal(out.breadcrumbs?.[0].data?.to, "/ticket/:code");
  assert.equal(out.breadcrumbs?.[1].data?.url, "https://x.com/api");
  assert.equal(out.breadcrumbs?.[1].data?.status_code, 200);
});

test("breadcrumb scrubber without data is untouched", () => {
  const c = { category: "ui.click" };
  assert.equal(scrubBreadcrumb(c), c);
});

test("GA location keeps utm_* only and redacts secrets", () => {
  assert.equal(
    buildGaPageLocation("https://a.com/d?utm_source=x&q=secret&utm_campaign=y#h"),
    "https://a.com/d?utm_source=x&utm_campaign=y",
  );
  assert.equal(buildGaPageLocation("https://a.com/invite/tok?a=1"), "https://a.com/invite/:token");
  assert.equal(buildGaPageLocation("nope"), "");
});

test("GA referrer is origin only", () => {
  assert.equal(buildGaReferrer("https://a.com/p?q=1"), "https://a.com");
  assert.equal(buildGaReferrer(""), "");
  assert.equal(buildGaReferrer("javascript:1"), "");
});
