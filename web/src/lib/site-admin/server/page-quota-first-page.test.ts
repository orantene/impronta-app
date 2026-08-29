/**
 * REGRESSION — a brand-new Free workspace could not create its FIRST page.
 *
 * Two quota gates disagreed. The outer one, in the server actions, is correct:
 * `resolveAdditionalPageDenial` counts OPERATOR-authored pages and passes the
 * count on. The inner one, inside `upsertPage`'s CREATE branch, called
 * `cmsAdditionalPageDeniedReason(plan)` with NO count — and that helper fails
 * CLOSED on an absent count ("assume the quota is spent").
 *
 * So `createDraftPageAction` and `duplicatePageAction` passed the outer gate and
 * were then refused by the inner one. "+ Add page", "Duplicate" and "Describe
 * with AI" all rendered ENABLED and all errored on a Free tenant that owned zero
 * pages. Because the empty-canvas AI entry point never renders on a seeded
 * homepage (it ships with four sections), that made the production AI page
 * generator unreachable for every new customer.
 *
 * The existing tests could not catch it: they exercised
 * `cmsAdditionalPageDeniedReason` as a PURE FUNCTION, where passing no count is
 * simply one of its documented modes. What was broken was the WIRING. These
 * tests therefore drive the gate the create path actually runs, against a
 * workspace shaped like a real first-run tenant.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { cmsAdditionalPageDeniedReason } from "@/lib/site-admin/builder-capabilities";

import { resolveAdditionalPageDenial } from "./page-quota";

const SRC = path.join(process.cwd(), "src");

type PageRow = {
  slug: string;
  status: string;
  system_template_key: string | null;
  is_system_owned: boolean;
};

/**
 * The pages the platform provisions for every workspace. A brand-new tenant is
 * NOT an empty `cms_pages` table — it already carries these four, which is
 * precisely why "count the rows" is the wrong question and
 * `loadQuotaCountedPageCount` exists.
 */
const SEEDED_SYSTEM_PAGES: PageRow[] = [
  { slug: "home", status: "published", system_template_key: "home", is_system_owned: true },
  { slug: "404", status: "published", system_template_key: "not_found", is_system_owned: true },
  { slug: "__book__", status: "published", system_template_key: "booking", is_system_owned: true },
  {
    slug: "__directory__",
    status: "published",
    system_template_key: "directory",
    is_system_owned: true,
  },
];

function operatorPage(slug: string): PageRow {
  return { slug, status: "draft", system_template_key: null, is_system_owned: false };
}

/**
 * Minimal stand-in for the two reads `resolveAdditionalPageDenial` performs:
 * one `agencies` row (plan tier + the role-pointer settings) and the tenant's
 * `cms_pages` rows. Chainable filters are no-ops; the query shape is asserted
 * by the calls succeeding at all.
 */
function fakeClient(params: {
  planTier: string | null;
  pages: PageRow[];
  settings?: Record<string, unknown>;
}): SupabaseClient {
  const client = {
    from(table: string) {
      const builder = {
        select() {
          return builder;
        },
        eq() {
          return builder;
        },
        neq() {
          return builder;
        },
        maybeSingle() {
          return Promise.resolve({
            data: { plan_tier: params.planTier, settings: params.settings ?? {} },
            error: null,
          });
        },
        then(
          resolve: (value: { data: PageRow[] | null; error: null }) => unknown,
        ) {
          assert.equal(table, "cms_pages", `unexpected awaited read on ${table}`);
          return Promise.resolve({ data: params.pages, error: null }).then(resolve);
        },
      };
      return builder;
    },
  };
  return client as unknown as SupabaseClient;
}

test("a fresh Free workspace may create its first operator page", async () => {
  const denial = await resolveAdditionalPageDenial(
    fakeClient({ planTier: "free", pages: SEEDED_SYSTEM_PAGES }),
    "tenant-1",
    "test",
  );
  assert.equal(
    denial,
    null,
    "a Free tenant that owns ZERO pages of its own must be allowed one",
  );
});

test("the Free allowance is one page, and the second is refused", async () => {
  const denial = await resolveAdditionalPageDenial(
    fakeClient({
      planTier: "free",
      pages: [...SEEDED_SYSTEM_PAGES, operatorPage("about")],
    }),
    "tenant-1",
    "test",
  );
  assert.match(String(denial), /one page of your own/);
});

test("a page promoted to a role stops consuming the allowance", async () => {
  const denial = await resolveAdditionalPageDenial(
    fakeClient({
      planTier: "free",
      pages: [...SEEDED_SYSTEM_PAGES, operatorPage("about")],
      settings: { pageRoles: { home: "about" } },
    }),
    "tenant-1",
    "test",
  );
  assert.equal(denial, null);
});

test("THE BUG: the same helper answers oppositely with and without a count", () => {
  // Not a hypothetical. `upsertPage` called the left-hand form; every real
  // caller had already computed the right-hand one.
  assert.match(String(cmsAdditionalPageDeniedReason("free")), /Upgrade to Studio/);
  assert.equal(cmsAdditionalPageDeniedReason("free", 0), null);
});

test("the CREATE branch of upsertPage routes through the counted gate", () => {
  const source = readFileSync(path.join(SRC, "lib/site-admin/server/pages.ts"), "utf8");
  assert.match(
    source,
    /resolveAdditionalPageDenial\(/,
    "upsertPage must evaluate the quota through the DEFAULT PAGES CONTRACT's one evaluator",
  );
  // Structural, not textual: the module must not be able to reach the
  // count-less helper at all. (The comment above the call site names it, so a
  // bare source-text search would pin prose instead of behaviour.)
  assert.doesNotMatch(
    source,
    /import\s*\{[^}]*cmsAdditionalPageDeniedReason[^}]*\}/,
    "a countless call to this helper denies a Free tenant its first page",
  );
});

test("savePageAction, a dead action carrying the same broken gate, is gone", () => {
  const source = readFileSync(
    path.join(SRC, "lib/server-actions/admin-site-pages.ts"),
    "utf8",
  );
  assert.doesNotMatch(source, /export async function savePageAction/);
});
