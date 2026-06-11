import assert from "node:assert/strict";
import { test } from "node:test";

import {
  coerceBuilderTree,
  coerceTheme,
  resolvePublishedTalentPage,
  type PublishedTalentPageActions,
  type PublishedTalentPageRow,
  type ResolvedTalentProfileRef,
} from "./published-talent-page-core";

/**
 * Pure-resolver proof for the public `/t/[profileCode]/[pageSlug]` renderer.
 * No Supabase / Next imports — drives the core with fake fetchers.
 */

const TALENT: ResolvedTalentProfileRef = {
  id: "talent-uuid-1",
  managingTenantId: "tenant-uuid-1",
  displayName: "Aria Vance",
};

function publishedRow(
  overrides: Partial<PublishedTalentPageRow> = {},
): PublishedTalentPageRow {
  return {
    id: "page-uuid-1",
    talent_profile_id: TALENT.id,
    slug: "home",
    title: "Aria — Home",
    status: "published",
    blocks: [{ id: "n1", kind: "container", props: {}, children: [] }],
    theme: { "abc": { display: "flex" } },
    published_at: "2026-06-11T00:00:00.000Z",
    ...overrides,
  };
}

function makeActions(opts: {
  talent: ResolvedTalentProfileRef | null;
  page: PublishedTalentPageRow | null;
}): PublishedTalentPageActions {
  return {
    loadTalentByProfileCode: async () => opts.talent,
    loadTalentPage: async () => opts.page,
  };
}

test("coerceBuilderTree: array passes through, non-array → []", () => {
  const tree = [{ id: "n", kind: "text" }];
  assert.equal(coerceBuilderTree(tree), tree);
  assert.deepEqual(coerceBuilderTree(null), []);
  assert.deepEqual(coerceBuilderTree({ not: "array" }), []);
  assert.deepEqual(coerceBuilderTree("[]"), []);
});

test("coerceTheme: plain object passes, array/null/string → {}", () => {
  const theme = { x: 1 };
  assert.equal(coerceTheme(theme), theme);
  assert.deepEqual(coerceTheme(null), {});
  assert.deepEqual(coerceTheme([1, 2]), {});
  assert.deepEqual(coerceTheme("{}"), {});
});

test("missing talent → null", async () => {
  const out = await resolvePublishedTalentPage(
    makeActions({ talent: null, page: publishedRow() }),
    { profileCode: "NOPE", slug: "home" },
  );
  assert.equal(out, null);
});

test("missing page → null", async () => {
  const out = await resolvePublishedTalentPage(
    makeActions({ talent: TALENT, page: null }),
    { profileCode: "ARIA", slug: "home" },
  );
  assert.equal(out, null);
});

test("draft page → null (defense-in-depth, not just RLS)", async () => {
  const out = await resolvePublishedTalentPage(
    makeActions({ talent: TALENT, page: publishedRow({ status: "draft" }) }),
    { profileCode: "ARIA", slug: "home" },
  );
  assert.equal(out, null);
});

test("scheduled page → null", async () => {
  const out = await resolvePublishedTalentPage(
    makeActions({ talent: TALENT, page: publishedRow({ status: "scheduled" }) }),
    { profileCode: "ARIA", slug: "home" },
  );
  assert.equal(out, null);
});

test("published page → normalized render payload with managing tenant", async () => {
  const row = publishedRow();
  const out = await resolvePublishedTalentPage(
    makeActions({ talent: TALENT, page: row }),
    { profileCode: "ARIA", slug: "home" },
  );
  assert.ok(out);
  assert.equal(out.pageId, "page-uuid-1");
  assert.equal(out.talentProfileId, "talent-uuid-1");
  assert.equal(out.tenantId, "tenant-uuid-1");
  assert.equal(out.title, "Aria — Home");
  assert.deepEqual(out.blocks, row.blocks);
  assert.deepEqual(out.theme, row.theme);
});

test("published page with null managing tenant → tenantId null, still renders", async () => {
  const talentNoTenant: ResolvedTalentProfileRef = {
    ...TALENT,
    managingTenantId: null,
  };
  const out = await resolvePublishedTalentPage(
    makeActions({ talent: talentNoTenant, page: publishedRow() }),
    { profileCode: "ARIA", slug: "home" },
  );
  assert.ok(out);
  assert.equal(out.tenantId, null);
});

test("malformed blocks/theme coerce to safe defaults", async () => {
  const out = await resolvePublishedTalentPage(
    makeActions({
      talent: TALENT,
      page: publishedRow({ blocks: null, theme: "oops" }),
    }),
    { profileCode: "ARIA", slug: "home" },
  );
  assert.ok(out);
  assert.deepEqual(out.blocks, []);
  assert.deepEqual(out.theme, {});
});
