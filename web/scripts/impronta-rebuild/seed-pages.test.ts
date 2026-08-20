import assert from "node:assert/strict";
import { test } from "node:test";

/** Loose row shape the seeder hands the Supabase mock (test-local). */
type SeedRowPayload = Record<string, never> & {
  [key: string]: unknown;
};
interface SeedNode {
  children: Array<{ props: Record<string, unknown> }>;
}
/** Narrow a captured payload after its `assert.ok` guard. */
function payloadOf(p: SeedRowPayload | null): Record<string, unknown> {
  if (!p) throw new Error("payload was not captured");
  return p as Record<string, unknown>;
}


import type { SupabaseClient } from "@supabase/supabase-js";

import {
  IMAGE_SLOT,
  collectImageSlots,
  imageSlotName,
  isImageSlotToken,
} from "./media-curation";
import {
  applyHomeInPlaceGuard,
  buildCmsPageUpsertPayload,
  countBuilderNodes,
  isProtectedSystemSlug,
  loadPageModules,
  normalizeAuthoredPage,
  pageModuleFileFor,
  pickPageExport,
  runSeed,
  seedablePageFiles,
  EXPECTED_PAGE_MODULE_FILES,
  HELD_PAGE_SLUGS,
  type ExistingCmsPageRow,
  type ImprontaPageModule,
} from "./seed-pages";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const APPROVED_IMAGE_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  tenant_id: "tenant-1",
  owner_talent_profile_id: null,
  variant_kind: "original",
  asset_kind: "image",
  storage_path: "tenant-1/hero.jpg",
  bucket_id: "media-public",
  public_url: "https://cdn.example.com/tenant-1/hero.jpg",
  width: 1600,
  height: 900,
  file_size: 12345,
  file_size_bytes: 12345,
  byte_size: 12345,
  mime: "image/jpeg",
  mime_type: "image/jpeg",
  alt: "A model on set",
  tags: [],
  created_at: "2026-01-01T00:00:00.000Z",
  metadata: {},
};

function pageFixture(overrides: Partial<ImprontaPageModule> = {}): ImprontaPageModule {
  return {
    slug: "about",
    title: "About Impronta",
    blocks: [
      {
        id: "sec-1",
        kind: "section",
        props: { sectionTypeKey: "generic" },
        children: [
          {
            id: "img-1",
            kind: "image",
            props: { src: IMAGE_SLOT("about-hero"), alt: "Hero" },
          },
        ],
      },
    ],
    seo: {
      metaTitle: "About | Impronta",
    },
    ...overrides,
  };
}

/** Minimal chainable query-builder mock — every method returns itself and it
 *  resolves (via `.then`) to `result` when awaited directly, or via
 *  `.maybeSingle()` when the real code calls that instead. */
function chainResult(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order", "limit"]) {
    builder[method] = () => builder;
  }
  // `range(from, to)` — the media library is read with real pagination now
  // (PostgREST caps a bare .limit() at db-max-rows). The first page returns
  // the fixture rows; any later page is empty so the paging loop terminates.
  builder.range = (from: number) =>
    Promise.resolve(from === 0 ? result : { data: [], error: null });
  builder.maybeSingle = () => Promise.resolve(result);
  builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

interface MockSupabaseOptions {
  mediaAssetRows?: unknown[];
  existingBySlug?: Record<string, ExistingCmsPageRow | null>;
  onInsert?: (payload: unknown) => void;
  onUpdate?: (id: unknown, payload: unknown) => void;
}

function makeSupabaseMock(opts: MockSupabaseOptions): SupabaseClient {
  const existingBySlug = opts.existingBySlug ?? {};
  const onInsert = opts.onInsert ?? (() => {});
  const onUpdate = opts.onUpdate ?? (() => {});

  const client = {
    from(table: string) {
      if (table === "media_assets") {
        return chainResult({ data: opts.mediaAssetRows ?? [], error: null });
      }
      if (table === "media_folders") {
        return chainResult({ data: [], error: null });
      }
      if (table === "cms_pages") {
        return {
          select() {
            const filters: Record<string, unknown> = {};
            const selectChain = {
              eq(col: string, val: unknown) {
                filters[col] = val;
                return selectChain;
              },
              maybeSingle: async () => ({
                data: existingBySlug[String(filters.slug)] ?? null,
                error: null,
              }),
            };
            return selectChain;
          },
          insert: async (payload: unknown) => {
            onInsert(payload);
            return { data: null, error: null };
          },
          update(payload: unknown) {
            return {
              eq: async (_col: string, id: unknown) => {
                onUpdate(id, payload);
                return { data: null, error: null };
              },
            };
          },
        };
      }
      throw new Error(`makeSupabaseMock: unexpected table "${table}"`);
    },
  };
  return client as unknown as SupabaseClient;
}

// ---------------------------------------------------------------------------
// buildCmsPageUpsertPayload
// ---------------------------------------------------------------------------

test("buildCmsPageUpsertPayload sets the right columns with the right defaults", () => {
  const page = pageFixture();
  const payload = buildCmsPageUpsertPayload(page, {
    tenantId: "tenant-1",
    effectiveSlug: "about",
    resolvedBlocks: [],
  });

  assert.equal(payload.tenant_id, "tenant-1");
  assert.equal(payload.locale, "en");
  assert.equal(payload.slug, "about");
  assert.equal(payload.title, "About Impronta");
  assert.equal(payload.is_freeform, true);
  assert.equal(payload.status, "draft");
});

test("buildCmsPageUpsertPayload always sets include_in_sitemap explicitly true by default", () => {
  const payload = buildCmsPageUpsertPayload(pageFixture(), {
    tenantId: "tenant-1",
    effectiveSlug: "about",
    resolvedBlocks: [],
  });
  assert.equal("include_in_sitemap" in payload, true);
  assert.equal(payload.include_in_sitemap, true);
});

test("buildCmsPageUpsertPayload respects an explicit includeInSitemap: false", () => {
  const page = pageFixture({ seo: { includeInSitemap: false } });
  const payload = buildCmsPageUpsertPayload(page, {
    tenantId: "tenant-1",
    effectiveSlug: "about",
    resolvedBlocks: [],
  });
  assert.equal(payload.include_in_sitemap, false);
});

test("buildCmsPageUpsertPayload defaults canonical_url to /p/<effectiveSlug>", () => {
  const payload = buildCmsPageUpsertPayload(pageFixture(), {
    tenantId: "tenant-1",
    effectiveSlug: "fashion-models-new",
    resolvedBlocks: [],
  });
  assert.equal(payload.canonical_url, "/p/fashion-models-new");
});

test("buildCmsPageUpsertPayload honors an explicit canonicalPath override", () => {
  const page = pageFixture({ seo: { canonicalPath: "/custom-path" } });
  const payload = buildCmsPageUpsertPayload(page, {
    tenantId: "tenant-1",
    effectiveSlug: "about",
    resolvedBlocks: [],
  });
  assert.equal(payload.canonical_url, "/custom-path");
});

test("buildCmsPageUpsertPayload omits json_ld when the module doesn't provide it (does not clobber an existing value on update)", () => {
  const payload = buildCmsPageUpsertPayload(pageFixture(), {
    tenantId: "tenant-1",
    effectiveSlug: "about",
    resolvedBlocks: [],
  });
  assert.equal("json_ld" in payload, false);
});

test("buildCmsPageUpsertPayload includes json_ld verbatim when provided", () => {
  const jsonLd = { "@context": "https://schema.org", "@type": "Organization" };
  const page = pageFixture({ seo: { jsonLd } });
  const payload = buildCmsPageUpsertPayload(page, {
    tenantId: "tenant-1",
    effectiveSlug: "about",
    resolvedBlocks: [],
  });
  assert.deepEqual(payload.json_ld, jsonLd);
});

test("buildCmsPageUpsertPayload honors a statusOverride (the home guard's mechanism)", () => {
  const payload = buildCmsPageUpsertPayload(pageFixture(), {
    tenantId: "tenant-1",
    effectiveSlug: "home",
    resolvedBlocks: [],
    statusOverride: "published",
  });
  assert.equal(payload.status, "published");
});

// ---------------------------------------------------------------------------
// applyHomeInPlaceGuard
// ---------------------------------------------------------------------------

test("applyHomeInPlaceGuard keeps an already-published home page published", () => {
  const existing: ExistingCmsPageRow = { id: "home-id", status: "published", slug: "home" };
  const override = applyHomeInPlaceGuard("home", existing, { allowHomeStatusDowngrade: false });
  assert.equal(override, "published");
});

test("applyHomeInPlaceGuard steps aside when --allow-home-status-downgrade is passed", () => {
  const existing: ExistingCmsPageRow = { id: "home-id", status: "published", slug: "home" };
  const override = applyHomeInPlaceGuard("home", existing, { allowHomeStatusDowngrade: true });
  assert.equal(override, undefined);
});

test("applyHomeInPlaceGuard does nothing when the existing home page is still a draft", () => {
  const existing: ExistingCmsPageRow = { id: "home-id", status: "draft", slug: "home" };
  const override = applyHomeInPlaceGuard("home", existing, { allowHomeStatusDowngrade: false });
  assert.equal(override, undefined);
});

test("applyHomeInPlaceGuard protects EVERY published page, not just home", () => {
  // This test asserted the opposite until 2026-08-20, when the behaviour it
  // was pinning took nine live English pages down: a routine re-seed of
  // about / for-clients / terms / the talent pages wrote them back as drafts
  // and the storefront served "Not found". A seeder must not unpublish a live
  // page, whatever its slug.
  const existing: ExistingCmsPageRow = { id: "about-id", status: "published", slug: "about" };
  const override = applyHomeInPlaceGuard("about", existing, { allowHomeStatusDowngrade: false });
  assert.equal(override, "published");
});

test("applyHomeInPlaceGuard still leaves a brand-new page as a draft", () => {
  // The default has to stay `draft` for pages that do not exist yet — seeding
  // a new page should not publish it to the world as a side effect.
  const override = applyHomeInPlaceGuard("brand-new", null, { allowHomeStatusDowngrade: false });
  assert.equal(override, undefined);
});

test("applyHomeInPlaceGuard leaves an existing DRAFT page as a draft", () => {
  const existing: ExistingCmsPageRow = { id: "x", status: "draft", slug: "some-page" };
  const override = applyHomeInPlaceGuard("some-page", existing, { allowHomeStatusDowngrade: false });
  assert.equal(override, undefined);
});

test("applyHomeInPlaceGuard does nothing when there is no existing home row", () => {
  const override = applyHomeInPlaceGuard("home", null, { allowHomeStatusDowngrade: false });
  assert.equal(override, undefined);
});

// ---------------------------------------------------------------------------
// countBuilderNodes
// ---------------------------------------------------------------------------

test("countBuilderNodes counts nested children", () => {
  const tree = pageFixture().blocks;
  // 1 section + 1 image child = 2
  assert.equal(countBuilderNodes(tree), 2);
});

// ---------------------------------------------------------------------------
// runSeed — dry-run writes nothing
// ---------------------------------------------------------------------------

test("runSeed dry-run resolves slots, validates, and reports actions but writes NOTHING", async () => {
  let insertCalls = 0;
  let updateCalls = 0;
  const supabase = makeSupabaseMock({
    mediaAssetRows: [APPROVED_IMAGE_ROW],
    existingBySlug: {},
    onInsert: () => {
      insertCalls += 1;
    },
    onUpdate: () => {
      updateCalls += 1;
    },
  });

  const result = await runSeed(supabase, [pageFixture()], {
    tenantId: "tenant-1",
    dryRun: true,
  });

  assert.equal(result.aborted, false);
  assert.equal(insertCalls, 0);
  assert.equal(updateCalls, 0);
  assert.equal(result.outcomes.length, 1);
  assert.equal(result.outcomes[0].action, "insert");
  assert.equal(result.outcomes[0].effectiveSlug, "about");
  assert.equal(result.outcomes[0].nodeCount, 2);
});

test("runSeed apply mode (dryRun: false) actually calls insert with a fully-resolved tree", async () => {
  let insertedPayload: SeedRowPayload | null = null;
  const supabase = makeSupabaseMock({
    mediaAssetRows: [APPROVED_IMAGE_ROW],
    existingBySlug: {},
    onInsert: (payload) => {
      insertedPayload = payload as SeedRowPayload;
    },
  });

  const result = await runSeed(supabase, [pageFixture()], {
    tenantId: "tenant-1",
    dryRun: false,
  });

  assert.equal(result.aborted, false);
  assert.ok(insertedPayload, "insert should have been called");
  assert.equal(payloadOf(insertedPayload).is_freeform, true);
  assert.equal(payloadOf(insertedPayload).status, "draft");
  const imageNode = (payloadOf(insertedPayload).blocks as SeedNode[])[0].children[0];
  assert.equal(imageNode.props.src, "https://cdn.example.com/tenant-1/hero.jpg");
  assert.equal(imageNode.props.mediaId, APPROVED_IMAGE_ROW.id);
});

test("runSeed applies --slug-suffix to the effective DB slug", async () => {
  let insertedPayload: SeedRowPayload | null = null;
  const supabase = makeSupabaseMock({
    mediaAssetRows: [APPROVED_IMAGE_ROW],
    onInsert: (payload) => {
      insertedPayload = payload as SeedRowPayload;
    },
  });

  await runSeed(supabase, [pageFixture()], {
    tenantId: "tenant-1",
    dryRun: false,
    slugSuffix: "-new",
  });

  assert.equal(payloadOf(insertedPayload).slug, "about-new");
  assert.equal(payloadOf(insertedPayload).canonical_url, "/p/about-new");
});

test("runSeed --only filters which page modules are processed", async () => {
  const supabase = makeSupabaseMock({ mediaAssetRows: [APPROVED_IMAGE_ROW] });
  const result = await runSeed(
    supabase,
    [pageFixture({ slug: "about" }), pageFixture({ slug: "contact" })],
    { tenantId: "tenant-1", dryRun: true, only: ["contact"] },
  );
  assert.equal(result.outcomes.length, 1);
  assert.equal(result.outcomes[0].slug, "contact");
});

// ---------------------------------------------------------------------------
// runSeed — the home-in-place guard, end to end
// ---------------------------------------------------------------------------

test("runSeed never deletes/recreates home and keeps a published home page published", async () => {
  let insertCalls = 0;
  let updatedId: unknown = null;
  let updatedPayload: SeedRowPayload | null = null;
  const supabase = makeSupabaseMock({
    mediaAssetRows: [APPROVED_IMAGE_ROW],
    existingBySlug: {
      home: { id: "home-row-id", status: "published", slug: "home" },
    },
    onInsert: () => {
      insertCalls += 1;
    },
    onUpdate: (id, payload) => {
      updatedId = id;
      updatedPayload = payload as SeedRowPayload;
    },
  });

  const result = await runSeed(supabase, [pageFixture({ slug: "home" })], {
    tenantId: "tenant-1",
    dryRun: false,
  });

  assert.equal(result.aborted, false);
  assert.equal(insertCalls, 0, "home must never be re-inserted while a row already exists");
  assert.equal(updatedId, "home-row-id");
  assert.equal(payloadOf(updatedPayload).status, "published", "home guard must keep status=published");
  assert.equal(result.outcomes[0].action, "update");
});

test("runSeed lets --allow-home-status-downgrade override the home guard", async () => {
  let updatedPayload: SeedRowPayload | null = null;
  const supabase = makeSupabaseMock({
    mediaAssetRows: [APPROVED_IMAGE_ROW],
    existingBySlug: {
      home: { id: "home-row-id", status: "published", slug: "home" },
    },
    onUpdate: (_id, payload) => {
      updatedPayload = payload as SeedRowPayload;
    },
  });

  await runSeed(supabase, [pageFixture({ slug: "home" })], {
    tenantId: "tenant-1",
    dryRun: false,
    allowHomeStatusDowngrade: true,
  });

  assert.equal(payloadOf(updatedPayload).status, "draft");
});

// ---------------------------------------------------------------------------
// runSeed — abort-the-whole-batch behavior
// ---------------------------------------------------------------------------

test("runSeed aborts the whole run (writes nothing) when an image slot cannot be resolved at all", async () => {
  let insertCalls = 0;
  const supabase = makeSupabaseMock({
    mediaAssetRows: [], // empty library -> no fallback candidate
    onInsert: () => {
      insertCalls += 1;
    },
  });

  const result = await runSeed(supabase, [pageFixture()], {
    tenantId: "tenant-1",
    dryRun: false,
  });

  assert.equal(result.aborted, true);
  assert.match(result.abortReason ?? "", /about-hero/);
  assert.equal(insertCalls, 0);
});

test("runSeed aborts the WHOLE BATCH (including otherwise-valid pages) when any one tree fails validation", async () => {
  let insertCalls = 0;
  const supabase = makeSupabaseMock({
    mediaAssetRows: [APPROVED_IMAGE_ROW],
    onInsert: () => {
      insertCalls += 1;
    },
  });

  const validPage = pageFixture({ slug: "about" });
  const brokenPage = pageFixture({
    slug: "contact",
    blocks: [
      {
        id: "bad-1",
        kind: "not_a_real_kind" as never,
        props: {},
      },
    ],
  });

  const result = await runSeed(supabase, [validPage, brokenPage], {
    tenantId: "tenant-1",
    dryRun: false,
  });

  assert.equal(result.aborted, true);
  assert.equal(insertCalls, 0, "the valid page must NOT be written when a sibling page in the batch is invalid");
});

// ── OWNER HOLD ───────────────────────────────────────────────────────────────

test("held pages are excluded from the seedable set", () => {
  const seedable = seedablePageFiles();
  assert.ok(
    !seedable.includes("chefs-culinary"),
    "chefs-culinary is on owner hold (zero tagged talent) and must not be seeded",
  );
  assert.equal(
    seedable.length,
    EXPECTED_PAGE_MODULE_FILES.length - HELD_PAGE_SLUGS.length,
    "exactly the held pages should be removed",
  );
  for (const file of EXPECTED_PAGE_MODULE_FILES) {
    if (!HELD_PAGE_SLUGS.includes(file)) {
      assert.ok(seedable.includes(file), `${file} must remain seedable`);
    }
  }
});

test("loadPageModules never loads a held page by default", async () => {
  const { pages, warnings } = await loadPageModules();
  assert.ok(
    !pages.some((p) => p.slug === "chefs-culinary"),
    "a held page must never reach the writer",
  );
  assert.ok(
    !warnings.some((w) => w.includes("OWNER HOLD")),
    "the default set already excludes held pages, so no hold warning should fire",
  );
});

test("explicitly passing a held page warns instead of silently seeding it", async () => {
  const { pages, warnings } = await loadPageModules(["chefs-culinary"]);
  assert.ok(
    warnings.some((w) => w.includes("OWNER HOLD")),
    "an explicit held page must announce the hold",
  );
  assert.equal(pages.length, 0, "and must still not be loaded for writing");
});

// ── PROTECTED SYSTEM PAGES ───────────────────────────────────────────────────

test("the seeder refuses to write the system /directory page", () => {
  assert.throws(
    () =>
      buildCmsPageUpsertPayload(
        { title: "x", seo: {} } as unknown as ImprontaPageModule,
        { tenantId: "t", effectiveSlug: "__directory__" } as never,
      ),
    /protected system page "__directory__"/,
    "the hand-tuned system directory page must never be overwritten",
  );
});

test("the seeder refuses the site shell and the legacy homepage row", () => {
  for (const slug of ["__site_shell__", ""]) {
    assert.throws(
      () =>
        buildCmsPageUpsertPayload(
          { title: "x", seo: {} } as unknown as ImprontaPageModule,
          { tenantId: "t", effectiveSlug: slug } as never,
        ),
      /protected system page/,
      `${slug || "(empty slug)"} must be protected`,
    );
  }
});

test("no page in the seedable set is a protected system slug", () => {
  for (const file of seedablePageFiles()) {
    assert.ok(
      !isProtectedSystemSlug(file),
      `${file} must not collide with a protected system slug`,
    );
  }
});

// ── AUTHORED-MODULE CONTRACT BRIDGE ──────────────────────────────────────────
//
// REGRESSION: the page-tree modules and this seeder were authored in parallel
// against different contracts (`{PAGE, blocks, camelCase seo}` here vs
// `{namedExport, tree, snake_case seo}` there), so EVERY module was skipped as
// invalid and a full run seeded nothing. Caught by the default dry run.

test("normalizeAuthoredPage maps tree -> blocks and snake_case seo -> camelCase", () => {
  const normalized = normalizeAuthoredPage({
    slug: "about",
    title: "About",
    tree: [{ id: "n1", kind: "heading", props: { text: "hi", level: 2 } }] as never,
    seo: {
      meta_title: "About | Impronta",
      meta_description: "desc",
      og_title: "og",
      og_description: "ogd",
      og_image_url: "https://cdn/x.jpg",
      canonical_url: "/p/about",
      noindex: false,
      include_in_sitemap: true,
      json_ld: { "@type": "Organization" },
    },
  });

  assert.equal(normalized.slug, "about");
  assert.equal(normalized.blocks.length, 1, "tree must become blocks");
  assert.equal(normalized.seo.metaTitle, "About | Impronta");
  assert.equal(normalized.seo.metaDescription, "desc");
  assert.equal(normalized.seo.ogTitle, "og");
  assert.equal(normalized.seo.ogDescription, "ogd");
  assert.equal(normalized.seo.ogImageUrl, "https://cdn/x.jpg");
  assert.equal(normalized.seo.canonicalPath, "/p/about");
  assert.equal(normalized.seo.noindex, false);
  assert.equal(normalized.seo.includeInSitemap, true);
  assert.deepEqual(normalized.seo.jsonLd, { "@type": "Organization" });
});

test("normalizeAuthoredPage omits absent seo keys (so updates do not clobber)", () => {
  const normalized = normalizeAuthoredPage({
    slug: "x", title: "X", tree: [] as never, seo: { meta_title: "only" },
  });
  assert.equal("jsonLd" in normalized.seo, false);
  assert.equal("noindex" in normalized.seo, false);
});

test("pickPageExport finds a NAMED page export, not just PAGE/default", () => {
  const found = pickPageExport({
    homePage: { slug: "home", title: "Home", tree: [], seo: { meta_title: "t" } },
  });
  assert.ok(found, "a named export must be discovered");
  assert.equal(found?.slug, "home");
});

test("pickPageExport still honours the PAGE/default contract", () => {
  const found = pickPageExport({
    PAGE: { slug: "a", title: "A", blocks: [], seo: { metaTitle: "t" } },
  });
  assert.equal(found?.slug, "a");
});

test("pickPageExport returns null when nothing page-shaped is exported", () => {
  assert.equal(pickPageExport({ helper: () => {}, CONST: 3 }), null);
});

test("the 404 page maps to its not-found.ts module file", () => {
  assert.equal(pageModuleFileFor("404"), "not-found");
  assert.equal(pageModuleFileFor("about"), "about", "other slugs map to themselves");
});

test("every seedable page resolves to a real, loadable module", async () => {
  const { pages, warnings } = await loadPageModules();
  const skipped = warnings.filter((w) => w.includes("skipping"));
  assert.deepEqual(skipped, [], `no page may be skipped: ${skipped.join(" | ")}`);
  assert.equal(
    pages.length,
    seedablePageFiles().length,
    "every seedable page module must load",
  );
});

// ── IMAGE SLOT PREFIX BRIDGE ─────────────────────────────────────────────────
//
// REGRESSION: the authored page modules emit `slot://impronta-rebuild/<name>`
// (shared.ts's own IMAGE_SLOT) while this seeder minted/recognised only
// `@@impronta-image-slot::<name>`. The seeder therefore found ZERO slots in
// trees containing 24 of them, and a dry run looked clean while an apply would
// have written the literal token string into every image `src` -- broken
// images on every page.

test("isImageSlotToken recognises BOTH the seeder and the authored prefixes", () => {
  assert.equal(isImageSlotToken(IMAGE_SLOT("hero")), true, "seeder-minted token");
  assert.equal(
    isImageSlotToken("slot://impronta-rebuild/hero"),
    true,
    "the prefix the authored page modules actually emit",
  );
  assert.equal(isImageSlotToken("https://cdn.example.com/x.jpg"), false);
  assert.equal(isImageSlotToken("/local/path.jpg"), false);
});

test("imageSlotName extracts the same name from either prefix", () => {
  assert.equal(imageSlotName(IMAGE_SLOT("about-hero")), "about-hero");
  assert.equal(imageSlotName("slot://impronta-rebuild/about-hero"), "about-hero");
});

test("collectImageSlots finds slots in an authored-prefix tree", () => {
  const tree = [
    {
      id: "s1",
      kind: "section",
      props: {},
      children: [
        { id: "i1", kind: "image", props: { src: "slot://impronta-rebuild/hero-a" } },
        { id: "i2", kind: "image", props: { src: "slot://impronta-rebuild/hero-b" } },
      ],
    },
  ];
  const found = collectImageSlots(tree as never);
  assert.deepEqual([...found].sort(), ["hero-a", "hero-b"]);
});

test("the real authored page trees expose their image slots to the seeder", async () => {
  const { pages } = await loadPageModules();
  const total = pages.reduce((n, p) => n + collectImageSlots(p.blocks).length, 0);
  assert.ok(
    total > 0,
    "the seeder must see the authored trees' image slots (0 means the prefix bridge regressed)",
  );
});

// ── NO DEAD LINKS TO HELD / MISSING PAGES ────────────────────────────────────
//
// REGRESSION: holding `chefs-culinary` (zero tagged talent) left THREE live
// links to /p/chefs-culinary -- a marquee entry and a division tile on home,
// and a division tile on for-clients. Every one would have 404'd. A held page
// must never be linked from a seeded page.

test("no seeded page links to a held or unseeded internal page", async () => {
  const { pages } = await loadPageModules();
  const seedableSlugs = new Set(seedablePageFiles());
  const offenders: string[] = [];

  for (const page of pages) {
    const hrefs = JSON.stringify(page.blocks).match(/"\/p\/[a-z0-9-]+"/g) ?? [];
    for (const raw of hrefs) {
      const slug = raw.replace(/"/g, "").replace("/p/", "");
      if (!seedableSlugs.has(slug)) {
        offenders.push(`${page.slug} -> /p/${slug}`);
      }
    }
  }

  assert.deepEqual(
    [...new Set(offenders)],
    [],
    `seeded pages must not link to a page that will not exist: ${offenders.join(", ")}`,
  );
});
