/**
 * editor-page-ref.test.ts — the editor's page identity must resolve to THAT
 * page's row, and only the homepage must resolve to the homepage.
 *
 * BACKGROUND: two server surfaces used to resolve the homepage unconditionally.
 *   - `share-actions.ts` called `loadDraftHomepage(...)`, so a share link minted
 *     while editing an inner page handed the recipient the HOMEPAGE draft.
 *   - `schedule-actions.ts` selected the homepage row by
 *     `system_template_key='homepage'`, so scheduling an inner page silently
 *     scheduled a homepage publish and the drawer read the homepage's fire time
 *     back under the inner page's title.
 *
 * Both now go through `resolveEditorPage`. These tests pin the three branches
 * and, critically, the TENANT PREDICATE — `pageId` arrives from a client
 * component and is untrusted, so a crafted id must not reach another
 * workspace's row.
 *
 * Test runner: node:test + node:assert/strict
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  EDITOR_PAGE_COLUMNS,
  hasExplicitPageRef,
  resolveEditorPage,
} from "./editor-page-ref";

interface FakeRow {
  id: string;
  tenant_id: string;
  locale: string;
  slug: string;
  title: string;
  version: number;
  status: string;
  is_system_owned: boolean;
  system_template_key: string | null;
  is_freeform: boolean;
}

const HOMEPAGE_EN: FakeRow = {
  id: "home-en",
  tenant_id: "tenant-1",
  locale: "en",
  slug: "",
  title: "Home",
  version: 9,
  status: "published",
  is_system_owned: true,
  system_template_key: "homepage",
  is_freeform: false,
};

const ABOUT_EN: FakeRow = {
  id: "about-en",
  tenant_id: "tenant-1",
  locale: "en",
  slug: "about",
  title: "About",
  version: 3,
  status: "draft",
  is_system_owned: false,
  system_template_key: null,
  is_freeform: true,
};

const ABOUT_ES: FakeRow = {
  ...ABOUT_EN,
  id: "about-es",
  locale: "es",
  title: "Sobre nosotros",
};

/** Another tenant's page that happens to be reachable by id if the tenant
 *  predicate is ever dropped. */
const OTHER_TENANT_PAGE: FakeRow = {
  ...ABOUT_EN,
  id: "foreign-page",
  tenant_id: "tenant-2",
};

const ALL_ROWS = [HOMEPAGE_EN, ABOUT_EN, ABOUT_ES, OTHER_TENANT_PAGE];

/**
 * Minimal PostgREST-shaped fake: records every `.eq()` predicate, then
 * evaluates them all against the row fixture. Because the predicates are
 * applied literally, dropping `tenant_id` from the query makes the
 * cross-tenant test below fail rather than pass silently.
 */
function fakeSupabase(rows: FakeRow[], seen: { selects: string[] } = { selects: [] }) {
  const client = {
    from(table: string) {
      assert.equal(table, "cms_pages");
      const filters: Array<[string, unknown]> = [];
      const builder = {
        select(columns: string) {
          seen.selects.push(columns);
          return builder;
        },
        eq(column: string, value: unknown) {
          filters.push([column, value]);
          return builder;
        },
        maybeSingle() {
          return builder;
        },
        returns() {
          const matched = rows.filter((row) =>
            filters.every(
              ([column, value]) =>
                (row as unknown as Record<string, unknown>)[column] === value,
            ),
          );
          assert.ok(
            matched.length <= 1,
            `query matched ${matched.length} rows — maybeSingle() would error in production. Filters: ${JSON.stringify(filters)}`,
          );
          return Promise.resolve({ data: matched[0] ?? null, error: null });
        },
      };
      return builder;
    },
  };
  return { client: client as unknown as SupabaseClient, seen };
}

// ── ref shape ──────────────────────────────────────────────────────────────

test("page identity comes from the id or the slug, never from nothing", () => {
  assert.equal(hasExplicitPageRef({ locale: "en" }), false);
  assert.equal(hasExplicitPageRef({ locale: "en", pageId: "about-en" }), true);
  assert.equal(hasExplicitPageRef({ locale: "en", pageSlug: "about" }), true);
  // Blank strings are the homepage, not a page named "".
  assert.equal(
    hasExplicitPageRef({ locale: "en", pageId: "  ", pageSlug: "" }),
    false,
  );
});

// ── resolution ─────────────────────────────────────────────────────────────

test("an explicit pageId resolves THAT page, not the homepage", async () => {
  const { client } = fakeSupabase(ALL_ROWS);
  const page = await resolveEditorPage(client, "tenant-1", {
    pageId: "about-en",
    locale: "en",
  });
  assert.equal(page?.id, "about-en");
  assert.equal(page?.isFreeform, true);
  assert.equal(page?.systemTemplateKey, null);
});

test("a slug resolves that page within the requested locale", async () => {
  const { client } = fakeSupabase(ALL_ROWS);
  const en = await resolveEditorPage(client, "tenant-1", {
    pageSlug: "about",
    locale: "en",
  });
  const es = await resolveEditorPage(client, "tenant-1", {
    pageSlug: "about",
    locale: "es",
  });
  assert.equal(en?.id, "about-en");
  assert.equal(es?.id, "about-es");
});

test("no id and no slug still resolves the homepage (the storefront homepage mounts with no slug)", async () => {
  const { client } = fakeSupabase(ALL_ROWS);
  const page = await resolveEditorPage(client, "tenant-1", { locale: "en" });
  assert.equal(page?.id, "home-en");
  assert.equal(page?.systemTemplateKey, "homepage");
});

test("blank id/slug strings fall back to the homepage rather than matching an empty slug", async () => {
  const { client } = fakeSupabase(ALL_ROWS);
  const page = await resolveEditorPage(client, "tenant-1", {
    pageId: null,
    pageSlug: "",
    locale: "en",
  });
  assert.equal(page?.id, "home-en");
});

test("the id branch is TENANT-SCOPED — another workspace's page id resolves to nothing", async () => {
  const { client } = fakeSupabase(ALL_ROWS);
  const page = await resolveEditorPage(client, "tenant-1", {
    pageId: "foreign-page",
    locale: "en",
  });
  assert.equal(
    page,
    null,
    "resolveEditorPage returned another tenant's row — pageId is client-supplied and the tenant predicate is the only thing standing between it and a cross-tenant read",
  );
});

test("an unknown slug resolves to nothing rather than silently falling back to the homepage", async () => {
  const { client } = fakeSupabase(ALL_ROWS);
  const page = await resolveEditorPage(client, "tenant-1", {
    pageSlug: "does-not-exist",
    locale: "en",
  });
  assert.equal(
    page,
    null,
    "a typo'd slug must surface as NOT_FOUND, not quietly schedule/share the homepage",
  );
});

test("every branch selects the columns callers route on", async () => {
  const { client, seen } = fakeSupabase(ALL_ROWS);
  await resolveEditorPage(client, "tenant-1", { pageId: "about-en", locale: "en" });
  await resolveEditorPage(client, "tenant-1", { pageSlug: "about", locale: "en" });
  await resolveEditorPage(client, "tenant-1", { locale: "en" });
  assert.equal(seen.selects.length, 3);
  for (const columns of seen.selects) {
    assert.equal(columns, EDITOR_PAGE_COLUMNS);
  }
  for (const col of ["is_freeform", "system_template_key", "version", "locale"]) {
    assert.ok(EDITOR_PAGE_COLUMNS.includes(col), `missing column ${col}`);
  }
});
