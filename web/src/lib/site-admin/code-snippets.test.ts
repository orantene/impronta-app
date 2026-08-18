/**
 * code-snippets.test.ts — the custom-code library's safety rules, in the one
 * place they are decided.
 *
 * This is the security-critical half of PR P3-C. A snippet is arbitrary code on
 * a public page, so every rule that keeps it on the RIGHT page is asserted here
 * against `selectSnippetsForRender`, which the storefront injector is the only
 * consumer of. Tenant isolation gets its own file next door in
 * `lib/saas/code-snippets-tenant-isolation.test.ts` so it is also carried by the
 * `test:tenant-isolation` lane; this file covers publish state, placement,
 * breakout, budget and the editor's validation.
 *
 * LANE
 * ────
 * `npm run test:builder-capabilities:a` — picked up automatically by
 * `list-test-files.cjs --depth=1 src/lib/site-admin`, and
 * `check:builder-test-lane-coverage` fails the build if that ever stops being
 * true.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  CODE_SNIPPET_CODE_MAX,
  CODE_SNIPPET_LIST_LIMIT,
  CODE_SNIPPET_NAME_MAX,
  CODE_SNIPPET_RENDER_BUDGET,
  canAddSnippet,
  inlineCodeBreakout,
  isRunnableSnippetKind,
  normalizeCodeSnippetInput,
  normalizeExternalUrl,
  publishedCodeLength,
  selectSnippetsForRender,
  selectionDroppedAnything,
  type OwnedCodeSnippet,
} from "./code-snippets";

const TENANT = "11111111-1111-4111-8111-111111111111";

function snippet(over: Partial<OwnedCodeSnippet> = {}): OwnedCodeSnippet {
  return {
    id: over.id ?? "s1",
    tenantId: over.tenantId ?? TENANT,
    name: over.name ?? "Snippet",
    kind: over.kind ?? "css",
    code: over.code ?? "body{color:red}",
    srcUrl: over.srcUrl ?? null,
    placement: over.placement ?? "head",
    isPublished: over.isPublished ?? true,
    publishedAt: over.publishedAt ?? "2026-08-18T00:00:00.000Z",
    createdAt: over.createdAt ?? "2026-08-18T00:00:00.000Z",
    updatedAt: over.updatedAt ?? null,
    sortOrder: over.sortOrder ?? 0,
  };
}

// ── publish state ────────────────────────────────────────────────────────────

test("an unpublished snippet never renders", () => {
  const rows = [
    snippet({ id: "draft", isPublished: false, publishedAt: null, code: "body{color:blue}" }),
    snippet({ id: "live", isPublished: true }),
  ];
  const out = selectSnippetsForRender(rows, { tenantId: TENANT, placement: "head" });
  assert.deepEqual(
    out.snippets.map((s) => s.id),
    ["live"],
  );
  assert.equal(out.dropped.unpublished, 1);
});

test("unpublishing is the whole kill switch — nothing published, nothing rendered", () => {
  const rows = [
    snippet({ id: "a", isPublished: false, publishedAt: null }),
    snippet({ id: "b", isPublished: false, publishedAt: null, placement: "body_end" }),
  ];
  assert.equal(
    selectSnippetsForRender(rows, { tenantId: TENANT, placement: "head" }).snippets.length,
    0,
  );
  assert.equal(
    selectSnippetsForRender(rows, { tenantId: TENANT, placement: "body_end" }).snippets
      .length,
    0,
  );
});

// ── placement routing ────────────────────────────────────────────────────────

test("placement routes head and body_end to different mount points", () => {
  const rows = [
    snippet({ id: "top", placement: "head" }),
    snippet({ id: "bottom", placement: "body_end" }),
  ];
  const head = selectSnippetsForRender(rows, { tenantId: TENANT, placement: "head" });
  const body = selectSnippetsForRender(rows, { tenantId: TENANT, placement: "body_end" });

  assert.deepEqual(head.snippets.map((s) => s.id), ["top"]);
  assert.deepEqual(body.snippets.map((s) => s.id), ["bottom"]);
  // Each call sees the other placement's row and drops it — no row is rendered twice.
  assert.equal(head.dropped.otherPlacement, 1);
  assert.equal(body.dropped.otherPlacement, 1);
});

test("render order is sortOrder then createdAt, so the admin list matches the page", () => {
  const rows = [
    snippet({ id: "c", sortOrder: 2, createdAt: "2026-01-01T00:00:00.000Z" }),
    snippet({ id: "b", sortOrder: 1, createdAt: "2026-03-01T00:00:00.000Z" }),
    snippet({ id: "a", sortOrder: 1, createdAt: "2026-02-01T00:00:00.000Z" }),
  ];
  const out = selectSnippetsForRender(rows, { tenantId: TENANT, placement: "head" });
  assert.deepEqual(out.snippets.map((s) => s.id), ["a", "b", "c"]);
});

// ── breakout / hostile content ───────────────────────────────────────────────

test("a script that closes its own tag is dropped, not escaped", () => {
  const hostile = 'var a=1;</script><script>alert(document.cookie)</script>';
  assert.ok(inlineCodeBreakout("js", hostile));

  const out = selectSnippetsForRender(
    [snippet({ id: "evil", kind: "js", code: hostile })],
    { tenantId: TENANT, placement: "head" },
  );
  assert.deepEqual(out.snippets, []);
  assert.equal(out.dropped.breakout, 1);
});

test("closing-tag detection survives casing and whitespace tricks", () => {
  for (const code of [
    "x;</SCRIPT >",
    "x;</ script>",
    "x;</\tscript>",
    "x;<!-- <script> -->",
    "x;-->",
  ]) {
    assert.ok(inlineCodeBreakout("js", code), `expected breakout for ${JSON.stringify(code)}`);
  }
  for (const code of ["a{content:'</STYLE>'}", "a{content:'</ style>'}"]) {
    assert.ok(inlineCodeBreakout("css", code), `expected breakout for ${JSON.stringify(code)}`);
  }
});

test("ordinary code with angle brackets is NOT treated as hostile", () => {
  assert.equal(inlineCodeBreakout("js", "if (a < b && c > d) { go(); }"), null);
  assert.equal(inlineCodeBreakout("js", 'el.innerHTML = "<b>hi</b>";'), null);
  assert.equal(inlineCodeBreakout("css", '.a::after { content: "<3"; }'), null);
  // The documented workaround an author is told to use must actually pass.
  assert.equal(inlineCodeBreakout("js", 'var s = "<\\/scr" + "ipt>";'), null);
});

test("the editor refuses hostile content at save time with a plain-language reason", () => {
  const res = normalizeCodeSnippetInput({
    name: "Bad",
    kind: "js",
    code: "</script>",
    placement: "head",
  });
  assert.equal(res.ok, false);
  assert.match(res.ok === false ? res.error : "", /ends the script early/);
});

// ── external URLs ────────────────────────────────────────────────────────────

test("external URLs reject every scheme that is really code execution", () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:text/javascript,alert(1)",
    "http://cdn.example.com/a.js",
    "//cdn.example.com/a.js",
    "https://user:pass@cdn.example.com/a.js",
    "",
    "not a url",
  ]) {
    assert.equal(normalizeExternalUrl(bad), null, `expected null for ${JSON.stringify(bad)}`);
  }
  assert.equal(
    normalizeExternalUrl("  https://cdn.example.com/a.js  "),
    "https://cdn.example.com/a.js",
  );
});

test("external kinds are stored but never runnable, and the editor says so", () => {
  assert.equal(isRunnableSnippetKind("external_script"), false);
  assert.equal(isRunnableSnippetKind("external_style"), false);
  assert.equal(isRunnableSnippetKind("css"), true);
  assert.equal(isRunnableSnippetKind("js"), true);

  const res = normalizeCodeSnippetInput({
    name: "CDN",
    kind: "external_script",
    srcUrl: "https://cdn.example.com/a.js",
    placement: "head",
  });
  assert.equal(res.ok, false);
  assert.match(res.ok === false ? res.error : "", /not available yet/);
});

test("an external row that reached the table anyway is dropped at render", () => {
  const out = selectSnippetsForRender(
    [snippet({ id: "cdn", kind: "external_script", code: "", srcUrl: "https://x.test/a.js" })],
    { tenantId: TENANT, placement: "head" },
  );
  assert.deepEqual(out.snippets, []);
  assert.equal(out.dropped.notRunnableKind, 1);
});

// ── budget ───────────────────────────────────────────────────────────────────

test("a runaway paste cannot balloon the page past the render budget", () => {
  const big = "a".repeat(CODE_SNIPPET_CODE_MAX);
  const rows = Array.from({ length: 6 }, (_, i) =>
    snippet({ id: `s${i}`, sortOrder: i, code: big }),
  );
  const out = selectSnippetsForRender(rows, { tenantId: TENANT, placement: "head" });
  const total = out.snippets.reduce((n, s) => n + s.code.length, 0);
  assert.ok(total <= CODE_SNIPPET_RENDER_BUDGET, `${total} exceeded the budget`);
  assert.ok(out.dropped.overBudget > 0);
  assert.equal(selectionDroppedAnything(out), true);
});

// ── validation ───────────────────────────────────────────────────────────────

test("a snippet must be named — the owner asked for names, so blank is an error", () => {
  const res = normalizeCodeSnippetInput({ name: "   ", kind: "css", code: "a{}", placement: "head" });
  assert.equal(res.ok, false);
  assert.match(res.ok === false ? res.error : "", /name/i);
});

test("normalization trims, collapses whitespace and canonicalizes newlines", () => {
  const res = normalizeCodeSnippetInput({
    name: "  Cookie   banner  ",
    kind: "css",
    code: "  a{color:red}\r\nb{color:blue}  ",
    placement: "body_end",
  });
  assert.equal(res.ok, true);
  if (!res.ok) return;
  assert.equal(res.value.name, "Cookie banner");
  assert.equal(res.value.code, "a{color:red}\nb{color:blue}");
  assert.equal(res.value.placement, "body_end");
  assert.equal(res.value.srcUrl, null);
});

test("caps are enforced before the DB CHECK has to be the error message", () => {
  const longName = normalizeCodeSnippetInput({
    name: "n".repeat(CODE_SNIPPET_NAME_MAX + 1),
    kind: "css",
    code: "a{}",
    placement: "head",
  });
  assert.equal(longName.ok, false);

  const longCode = normalizeCodeSnippetInput({
    name: "Big",
    kind: "css",
    code: "a".repeat(CODE_SNIPPET_CODE_MAX + 1),
    placement: "head",
  });
  assert.equal(longCode.ok, false);

  const emptyCode = normalizeCodeSnippetInput({
    name: "Empty",
    kind: "js",
    code: "   ",
    placement: "head",
  });
  assert.equal(emptyCode.ok, false);
});

test("unknown kind and unknown placement are refused", () => {
  assert.equal(
    normalizeCodeSnippetInput({ name: "x", kind: "php", code: "a", placement: "head" }).ok,
    false,
  );
  assert.equal(
    normalizeCodeSnippetInput({ name: "x", kind: "css", code: "a{}", placement: "footer" }).ok,
    false,
  );
});

// ── admin helpers ────────────────────────────────────────────────────────────

test("the per-tenant snippet count is capped", () => {
  assert.equal(canAddSnippet(0), true);
  assert.equal(canAddSnippet(CODE_SNIPPET_LIST_LIMIT - 1), true);
  assert.equal(canAddSnippet(CODE_SNIPPET_LIST_LIMIT), false);
});

test("publishedCodeLength counts only published, runnable rows on that placement", () => {
  const rows = [
    snippet({ id: "a", code: "12345" }),
    snippet({ id: "b", code: "12345", isPublished: false }),
    snippet({ id: "c", code: "12345", placement: "body_end" }),
    snippet({ id: "d", code: "", kind: "external_style", srcUrl: "https://x.test/a.css" }),
  ];
  assert.equal(publishedCodeLength(rows, "head"), 5);
  assert.equal(publishedCodeLength(rows, "body_end"), 5);
});
