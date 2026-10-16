import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { sanitizeReferrer, stripUrlQuery, scrubAnalyticsPayload } from "./sanitize-url";

test("sanitizeReferrer keeps origin only", () => {
  assert.equal(sanitizeReferrer("https://a.com/p?token=x#f"), "https://a.com");
  assert.equal(sanitizeReferrer("javascript:alert(1)"), null);
  assert.equal(sanitizeReferrer(""), null);
});

test("stripUrlQuery drops query and fragment", () => {
  assert.equal(stripUrlQuery("https://a.com/pay/abc?code=1&e=u@x.com#h"), "https://a.com/pay/abc");
  assert.equal(stripUrlQuery("/login?next=/x&code=9"), "/login");
  assert.equal(stripUrlQuery("mailto:a@b.com"), null);
});

test("scrubAnalyticsPayload scrubs url-like fields, keeps others", () => {
  const out = scrubAnalyticsPayload({
    referrer: "https://g.com/s?q=a@b.com",
    url: "https://a.com/x?token=t",
    href: "/y?code=1",
    surface: "talent",
  });
  assert.deepEqual(out, { referrer: "https://g.com", url: "https://a.com/x", href: "/y", surface: "talent" });
});

test("events route and error boundary use the scrubbers", () => {
  const route = readFileSync("src/app/api/analytics/events/route.ts", "utf8");
  assert.match(route, /scrubAnalyticsPayload/);
  assert.match(route, /sanitizeReferrer\(referrer\)/);
  assert.match(route, /stripUrlQuery\(path\)/);
  const err = readFileSync("src/app/error.tsx", "utf8");
  assert.doesNotMatch(err, /window\.location\.href/);
});
