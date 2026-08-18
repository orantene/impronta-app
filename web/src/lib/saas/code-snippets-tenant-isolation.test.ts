/**
 * code-snippets-tenant-isolation.test.ts — custom code must never execute on a
 * site that does not own it.
 *
 * WHY THIS FILE EXISTS SEPARATELY FROM lib/site-admin/code-snippets.test.ts
 * ────────────────────────────────────────────────────────────────────────
 * The other file proves the whole rule set and runs in
 * `test:builder-capabilities:a`. Isolation is not "one of the rules" here — it
 * is the failure this feature could cause that nothing else in the product can:
 * one agency's JavaScript running on another agency's storefront reads that
 * agency's visitors. Repeating it in the `test:tenant-isolation` lane means the
 * assertion is carried by the lane a reviewer opens when they ask "what stops
 * cross-tenant leakage", alongside `tenant-isolation.test.ts` and friends.
 *
 * WHAT IT CAN AND CANNOT SEE
 * ──────────────────────────
 * `selectSnippetsForRender` is the last gate before the DOM: the storefront
 * injector renders its output and nothing else. So these tests prove the
 * APPLICATION-layer half of isolation exhaustively. They do not execute SQL, so
 * they say nothing about the two DB-layer halves — the
 * `cms_code_snippets_select_tenant_published` policy and the
 * `cms_public_code_snippets_for_tenant` reader RPC that sets the
 * `app.current_tenant_id` GUC. Those are asserted by review of
 * `supabase/migrations/20260818220807_cms_code_snippets.sql`, which follows the
 * wire model established in the P4 CMS public-read migration. Stated plainly
 * rather than implied: three layers exist, one of them is covered here.
 *
 * LANE
 * ────
 * `npm run test:tenant-isolation` (registered explicitly in package.json — a
 * test in no lane never runs).
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  selectSnippetsForRender,
  type OwnedCodeSnippet,
} from "@/lib/site-admin/code-snippets";

const AGENCY_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const AGENCY_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const HUB = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function snippet(over: Partial<OwnedCodeSnippet> & { tenantId: string }): OwnedCodeSnippet {
  return {
    id: over.id ?? "s1",
    tenantId: over.tenantId,
    name: over.name ?? "Snippet",
    kind: over.kind ?? "js",
    code: over.code ?? "window.__mine = 1;",
    srcUrl: over.srcUrl ?? null,
    placement: over.placement ?? "head",
    isPublished: over.isPublished ?? true,
    publishedAt: over.publishedAt ?? "2026-08-18T00:00:00.000Z",
    createdAt: over.createdAt ?? "2026-08-18T00:00:00.000Z",
    updatedAt: over.updatedAt ?? null,
    sortOrder: over.sortOrder ?? 0,
  };
}

test("the read path returns only the requested tenant's PUBLISHED snippets", () => {
  const rows = [
    snippet({ id: "a-live", tenantId: AGENCY_A, code: "window.a = 1;" }),
    snippet({ id: "a-draft", tenantId: AGENCY_A, isPublished: false, publishedAt: null }),
    snippet({ id: "b-live", tenantId: AGENCY_B, code: "window.b = 1;" }),
    snippet({ id: "b-draft", tenantId: AGENCY_B, isPublished: false, publishedAt: null }),
    snippet({ id: "hub-live", tenantId: HUB, code: "window.hub = 1;" }),
  ];

  const forA = selectSnippetsForRender(rows, { tenantId: AGENCY_A, placement: "head" });
  assert.deepEqual(forA.snippets.map((s) => s.id), ["a-live"]);
  assert.equal(forA.dropped.otherTenant, 3);
  assert.equal(forA.dropped.unpublished, 1);

  const forB = selectSnippetsForRender(rows, { tenantId: AGENCY_B, placement: "head" });
  assert.deepEqual(forB.snippets.map((s) => s.id), ["b-live"]);
});

test("no snippet of tenant A is ever emitted while rendering tenant B", () => {
  const rows = [
    snippet({ id: "a1", tenantId: AGENCY_A, code: "window.a = 1;" }),
    snippet({ id: "a2", tenantId: AGENCY_A, placement: "body_end", code: "window.a2 = 1;" }),
  ];
  for (const placement of ["head", "body_end"] as const) {
    const out = selectSnippetsForRender(rows, { tenantId: AGENCY_B, placement });
    assert.deepEqual(out.snippets, [], `leaked into ${placement}`);
  }
});

test("the platform hub renders no tenant's custom code", () => {
  const rows = [
    snippet({ id: "a1", tenantId: AGENCY_A }),
    snippet({ id: "b1", tenantId: AGENCY_B }),
  ];
  const out = selectSnippetsForRender(rows, { tenantId: HUB, placement: "head" });
  assert.deepEqual(out.snippets, []);
  assert.equal(out.dropped.otherTenant, 2);
});

test("an unresolved tenant renders nothing — fails closed, never open", () => {
  const rows = [snippet({ id: "a1", tenantId: AGENCY_A })];
  for (const tenantId of ["", "   ".trim()]) {
    const out = selectSnippetsForRender(rows, { tenantId, placement: "head" });
    assert.deepEqual(out.snippets, []);
    assert.equal(out.dropped.otherTenant, 1);
  }
});

test("a forged tenant id that merely LOOKS like the owner's does not match", () => {
  const rows = [snippet({ id: "a1", tenantId: AGENCY_A })];
  for (const nearMiss of [
    AGENCY_A.toUpperCase(),
    `${AGENCY_A} `,
    AGENCY_A.slice(0, -1),
    `${AGENCY_A}x`,
  ]) {
    const out = selectSnippetsForRender(rows, { tenantId: nearMiss, placement: "head" });
    assert.deepEqual(out.snippets, [], `matched on ${JSON.stringify(nearMiss)}`);
  }
});

test("isolation holds even when the other tenant's snippet sorts first", () => {
  const rows = [
    snippet({ id: "b-first", tenantId: AGENCY_B, sortOrder: -10, code: "window.b = 1;" }),
    snippet({ id: "a-only", tenantId: AGENCY_A, sortOrder: 5, code: "window.a = 1;" }),
  ];
  const out = selectSnippetsForRender(rows, { tenantId: AGENCY_A, placement: "head" });
  assert.deepEqual(out.snippets.map((s) => s.id), ["a-only"]);
  assert.equal(out.snippets.some((s) => s.code.includes("window.b")), false);
});

test("the other tenant's rows do not consume this tenant's render budget", () => {
  const huge = "a".repeat(19_000);
  const rows = [
    ...Array.from({ length: 5 }, (_, i) =>
      snippet({ id: `b${i}`, tenantId: AGENCY_B, sortOrder: i, kind: "css", code: huge }),
    ),
    snippet({ id: "a-small", tenantId: AGENCY_A, sortOrder: 9, kind: "css", code: "a{}" }),
  ];
  const out = selectSnippetsForRender(rows, { tenantId: AGENCY_A, placement: "head" });
  assert.deepEqual(out.snippets.map((s) => s.id), ["a-small"]);
  assert.equal(out.dropped.overBudget, 0);
});
