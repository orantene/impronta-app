/**
 * redirect-query.security.test.ts — characterization of buildQuerySuffix in
 * src/lib/saas/redirect-query.ts.
 *
 * This helper forwards incoming query params into a server-side redirect URL
 * (app/admin → /<tenantSlug>/admin?…). Reflected query → redirect target is a
 * classic CRLF-/parameter-injection surface, so the security property is:
 * "every key and value is percent-encoded; no caller input can break out of
 * the query string into headers, a new param, the path, or a fragment."
 *
 * Companion to redirect-query.test.ts (functional cases). Pure → behavioural.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { buildQuerySuffix } from "./redirect-query";

test("buildQuerySuffix: CRLF in a VALUE is percent-encoded — no header/response-splitting breakout", () => {
  const out = buildQuerySuffix({ next: "ok\r\nSet-Cookie: pwn=1" });
  assert.doesNotMatch(out, /\r|\n/, "raw CR/LF must never appear in the suffix");
  assert.match(out, /%0D%0A/, "CRLF is encoded");
});

test("buildQuerySuffix: CRLF / & / = / # / ? in a KEY is encoded — cannot split into a new param or path/fragment", () => {
  const out = buildQuerySuffix({ "a&b=c\r\n#x?y": "1" });
  assert.doesNotMatch(out, /\r|\n/);
  // Exactly one separator '?' (the prefix) and no stray '&' / unescaped '#'.
  assert.equal(out.indexOf("?"), 0, "the only literal '?' is the leading prefix");
  assert.equal((out.match(/&/g) ?? []).length, 0, "no attacker-introduced '&' param split");
  assert.match(out, /a%26b%3Dc%0D%0A%23x%3Fy=1/);
});

test("buildQuerySuffix: an empty-string value is a PRESENT param (only `undefined` is dropped)", () => {
  assert.equal(buildQuerySuffix({ a: "" }), "?a=");
  assert.equal(buildQuerySuffix({ a: "", b: undefined, c: "3" }), "?a=&c=3");
});

test("buildQuerySuffix: never emits a double '?' even when a value itself contains '?'", () => {
  const out = buildQuerySuffix({ next: "/dash?tab=1&x=2" });
  assert.equal(out.indexOf("?"), 0);
  assert.equal((out.match(/\?/g) ?? []).length, 1, "value '?' is encoded, only the prefix is literal");
  assert.match(out, /next=%2Fdash%3Ftab%3D1%26x%3D2/);
});

test("buildQuerySuffix: a 'next'-style absolute/protocol-relative value is encoded, not reflected as a live URL", () => {
  // buildQuerySuffix does NOT itself open-redirect (it only encodes into a
  // query string), but pinning that the dangerous chars are neutralised here
  // documents that any open-redirect defence must live at the consumer.
  const out = buildQuerySuffix({ next: "//evil.example.com/login" });
  assert.match(out, /next=%2F%2Fevil\.example\.com%2Flogin/);
  assert.doesNotMatch(out, /next=\/\//, "the // is encoded, not literal");
});

test("buildQuerySuffix: a literal '__proto__' key is treated as ordinary data (no prototype pollution; read-only)", () => {
  const payload: Record<string, string> = {};
  Object.defineProperty(payload, "__proto__", {
    value: "polluted",
    enumerable: true,
    configurable: true,
  });
  const out = buildQuerySuffix(payload);
  assert.match(out, /__proto__=polluted/, "encoded as a normal param");
  assert.equal(
    ({} as Record<string, unknown>).polluted,
    undefined,
    "Object.prototype is untouched — the helper only reads via Object.entries",
  );
});

test("buildQuerySuffix: array with every entry undefined → empty string (no '?', no dangling key)", () => {
  assert.equal(
    buildQuerySuffix({ tag: [undefined as unknown as string, undefined as unknown as string] }),
    "",
  );
});

test("buildQuerySuffix: unicode / spaces are form-encoded (space → '+', non-ascii → %XX)", () => {
  assert.equal(buildQuerySuffix({ q: "café münchen" }), "?q=caf%C3%A9+m%C3%BCnchen");
});
