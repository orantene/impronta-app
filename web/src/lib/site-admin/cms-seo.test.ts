/**
 * P4-SEO (T4.3) — unit tests for the pure SEO authoring helpers.
 * Run: tsx --test src/lib/site-admin/cms-seo.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parsePageJsonLd,
  jsonLdDocumentToScript,
  jsonLdDocumentToEditorText,
  organizationJsonLdStub,
  normalizeRedirectPath,
  normalizeRedirectPair,
  PAGE_JSON_LD_MAX,
} from "./cms-seo";

// ── parsePageJsonLd ──────────────────────────────────────────────────────────

test("empty / whitespace JSON-LD clears the field", () => {
  assert.deepEqual(parsePageJsonLd(""), { ok: true, value: null });
  assert.deepEqual(parsePageJsonLd("   \n  "), { ok: true, value: null });
  assert.deepEqual(parsePageJsonLd(null), { ok: true, value: null });
  assert.deepEqual(parsePageJsonLd(undefined), { ok: true, value: null });
});

test("valid single object with @context parses", () => {
  const res = parsePageJsonLd(
    '{"@context":"https://schema.org","@type":"Organization","name":"Impronta"}',
  );
  assert.equal(res.ok, true);
  assert.ok(res.ok && !Array.isArray(res.value));
  assert.equal(res.ok && (res.value as Record<string, unknown>)["@type"], "Organization");
});

test("valid array of objects parses", () => {
  const res = parsePageJsonLd(
    '[{"@context":"https://schema.org","@type":"Organization","name":"A"},{"@context":"https://schema.org","@type":"WebSite","name":"B"}]',
  );
  assert.equal(res.ok, true);
  assert.ok(res.ok && Array.isArray(res.value));
  assert.equal(res.ok && Array.isArray(res.value) && res.value.length, 2);
});

test("invalid JSON is rejected with a friendly message", () => {
  const res = parsePageJsonLd("{not json");
  assert.equal(res.ok, false);
  assert.match((res as { error: string }).error, /valid JSON/);
});

test("object missing @context is rejected", () => {
  const res = parsePageJsonLd('{"@type":"Organization","name":"X"}');
  assert.equal(res.ok, false);
  assert.match((res as { error: string }).error, /@context/);
});

test("a non-object (bare string / number) is rejected", () => {
  assert.equal(parsePageJsonLd('"hello"').ok, false);
  assert.equal(parsePageJsonLd("42").ok, false);
});

test("an array entry missing @context is rejected", () => {
  const res = parsePageJsonLd(
    '[{"@context":"https://schema.org","@type":"Organization"},{"@type":"WebSite"}]',
  );
  assert.equal(res.ok, false);
});

test("empty array is rejected", () => {
  assert.equal(parsePageJsonLd("[]").ok, false);
});

test("oversized JSON-LD is rejected", () => {
  const big = `{"@context":"https://schema.org","name":"${"x".repeat(PAGE_JSON_LD_MAX)}"}`;
  const res = parsePageJsonLd(big);
  assert.equal(res.ok, false);
  assert.match((res as { error: string }).error, /characters or fewer/);
});

// ── jsonLdDocumentToScript ───────────────────────────────────────────────────

test("script serialization escapes < to prevent </script> breakout", () => {
  const out = jsonLdDocumentToScript({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "</script><script>alert(1)</script>",
  });
  assert.ok(!out.includes("</script>"));
  assert.ok(out.includes("\\u003c"));
});

test("null document serializes to empty string", () => {
  assert.equal(jsonLdDocumentToScript(null), "");
  assert.equal(jsonLdDocumentToEditorText(null), "");
});

test("round-trip: stub -> parse -> editor text stays valid", () => {
  const stub = organizationJsonLdStub({ name: "Impronta", url: "https://impronta.test" });
  const parsed = parsePageJsonLd(stub);
  assert.equal(parsed.ok, true);
  assert.ok(parsed.ok && parsed.value);
  const text = jsonLdDocumentToEditorText(parsed.ok ? parsed.value : null);
  // The pretty-printed text re-parses cleanly.
  assert.equal(parsePageJsonLd(text).ok, true);
});

test("stub omits url when blank", () => {
  const stub = organizationJsonLdStub({ name: "X", url: "  " });
  assert.ok(!stub.includes('"url"'));
});

// ── redirect normalization ───────────────────────────────────────────────────

test("redirect path gets a leading slash", () => {
  assert.deepEqual(normalizeRedirectPath("old-page"), { ok: true, value: "/old-page" });
});

test("redirect path strips a trailing slash (but keeps root)", () => {
  assert.deepEqual(normalizeRedirectPath("/old/"), { ok: true, value: "/old" });
  assert.deepEqual(normalizeRedirectPath("/"), { ok: true, value: "/" });
});

test("redirect path collapses double slashes", () => {
  assert.deepEqual(normalizeRedirectPath("//a//b"), { ok: true, value: "/a/b" });
});

test("redirect path rejects spaces, query, fragment, full URL, empty", () => {
  assert.equal(normalizeRedirectPath("/a b").ok, false);
  assert.equal(normalizeRedirectPath("/a?x=1").ok, false);
  assert.equal(normalizeRedirectPath("/a#h").ok, false);
  assert.equal(normalizeRedirectPath("https://x.com/a").ok, false);
  assert.equal(normalizeRedirectPath("   ").ok, false);
});

test("redirect pair rejects identical normalized paths", () => {
  const res = normalizeRedirectPair({ oldPath: "/a/", newPath: "/a" });
  assert.equal(res.ok, false);
  assert.match((res as { error: string }).error, /different/);
});

test("redirect pair defaults to 301 and clamps to 302", () => {
  assert.equal(
    (normalizeRedirectPair({ oldPath: "/a", newPath: "/b" }) as { statusCode: number }).statusCode,
    301,
  );
  assert.equal(
    (normalizeRedirectPair({ oldPath: "/a", newPath: "/b", statusCode: 302 }) as { statusCode: number }).statusCode,
    302,
  );
  assert.equal(
    (normalizeRedirectPair({ oldPath: "/a", newPath: "/b", statusCode: 307 }) as { statusCode: number }).statusCode,
    301,
  );
});

test("redirect pair surfaces which side failed", () => {
  assert.match(
    (normalizeRedirectPair({ oldPath: "/a b", newPath: "/c" }) as { error: string }).error,
    /^From:/,
  );
  assert.match(
    (normalizeRedirectPair({ oldPath: "/a", newPath: "/c d" }) as { error: string }).error,
    /^To:/,
  );
});
