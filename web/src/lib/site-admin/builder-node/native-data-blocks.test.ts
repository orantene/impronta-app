/**
 * WS7 Phase 0 — the NATIVE data blocks (`hero_search`, `talent_type_grid`).
 *
 * These two kinds exist so the homepage's data-driven sections stop depending on
 * `section_embed` (which re-embeds the frozen curated section and is therefore
 * NOT parity for the legacy-registry deletion). What matters here:
 *
 *   1. they render from `dataSources` and ONLY from `dataSources`;
 *   2. the empty-roster and single-item cases both produce sane markup;
 *   3. the tenant gate holds — a node handed one tenant's data cannot surface
 *      another tenant's talent, in either direction.
 *
 * Run: node_modules/.bin/tsx --test src/lib/site-admin/builder-node/native-data-blocks.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import {
  renderBuilderNodes,
  type BuilderNodeRenderDataSources,
} from "./render";
import { BUILDER_NODE_REGISTRY } from "./registry";
import { validateBuilderNodeTree } from "./validate";
import { SHIPPED_ELEMENT_INSERT_KINDS } from "./mvp-allow-list";
import {
  collectNativeDataBlockNeeds,
  nativeFeaturedTalentSignature,
} from "./native-data-block-needs";
import {
  deriveTalentDisciplines,
  deriveWorkspaceMenuOfferings,
  type TalentTaxonomyJoinRow,
} from "@/lib/site-admin/server/native-data-block-sources";
import type { TalentOfferingRow } from "@/lib/talent/offerings-types";
import type { BuilderNode } from "./types";

function render(
  nodes: BuilderNode[],
  dataSources: BuilderNodeRenderDataSources = {},
): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources,
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

function heroNode(props: Record<string, unknown> = {}): BuilderNode {
  return {
    id: "hero-1",
    kind: "hero_search",
    props: {
      headline: "Find the right talent",
      statSource: "tenant_talent_count",
      statCountLabel: "represented talent",
      ...props,
    },
  } as BuilderNode;
}

function gridNode(props: Record<string, unknown> = {}): BuilderNode {
  return {
    id: "grid-1",
    kind: "talent_type_grid",
    props: {
      headline: "Talent, by discipline",
      mode: "dynamic",
      ...props,
    },
  } as BuilderNode;
}

function menuNode(props: Record<string, unknown> = {}): BuilderNode {
  return {
    id: "menu-1",
    kind: "menu_board",
    props: {
      title: "Menu",
      subtitle: "Pick what works for you.",
      emptyMessage: "Nothing is published yet.",
      ...props,
    },
  } as BuilderNode;
}

function menuRow(overrides: Partial<TalentOfferingRow> & { tenant_id: string }): TalentOfferingRow {
  return {
    id: overrides.id ?? "menu-row",
    talent_profile_id: overrides.talent_profile_id ?? null,
    owner_kind: overrides.owner_kind ?? "workspace",
    tenant_id: overrides.tenant_id,
    kind: overrides.kind ?? "service",
    title: overrides.title ?? "Menu item",
    description: overrides.description ?? null,
    price_type: overrides.price_type ?? "flat_package",
    price_display: overrides.price_display ?? "exact",
    amount_cents: overrides.amount_cents ?? 2500,
    currency: overrides.currency ?? "USD",
    booking_mode: overrides.booking_mode ?? "request",
    reserve_mode: overrides.reserve_mode ?? "full",
    deposit_pct: overrides.deposit_pct ?? null,
    allow_pay_in_person: overrides.allow_pay_in_person ?? false,
    require_account_to_book: overrides.require_account_to_book ?? false,
    cancellation_hours: overrides.cancellation_hours ?? null,
    free_reserve_expires_days: overrides.free_reserve_expires_days ?? null,
    duration_minutes: overrides.duration_minutes ?? null,
    category: overrides.category ?? null,
    inventory_qty: overrides.inventory_qty ?? null,
    // Stock is a POOL fact: the derive requires capacity_pool_id, so a fixture
    // that omits it is an UNLIMITED item however its inventory_qty reads.
    capacity_pool_id: overrides.capacity_pool_id ?? null,
    consumes_units: overrides.consumes_units ?? 1,
    status: overrides.status ?? "published",
    visibility: overrides.visibility ?? "public",
    moderation_state: overrides.moderation_state ?? "approved",
    is_featured: overrides.is_featured ?? false,
    sort_order: overrides.sort_order ?? 0,
    attributes: overrides.attributes ?? {},
    title_i18n: overrides.title_i18n ?? null,
    description_i18n: overrides.description_i18n ?? null,
  } as TalentOfferingRow;
}

/**
 * The blocks this file guards. Extracted to ONE constant because the same list
 * was hardcoded inline in THREE separate places, and a block added to two of
 * them and missed in the third would be guarded by two assertions out of three
 * with nothing failing — the same silent-partial-registration shape this file
 * exists to catch.
 *
 * `reserve_table`, `session_picker` and `qr_code` are here despite having NO
 * `native-data-block-needs` entry: they load their data client-side through a
 * dynamically imported server action, so they need no server provisioning, but
 * each is still a registry leaf
 * that must be insertable and must seed a valid tree. Those are what the
 * assertions below actually check.
 */
const NATIVE_DATA_BLOCK_KINDS = [
  "hero_search",
  "menu_board",
  "talent_type_grid",
  "reserve_table",
  "session_picker",
  "qr_code",
] as const;

// ── registry + insertability ────────────────────────────────────────────────

test("all native data blocks are registered as structural leaves", () => {
  for (const kind of NATIVE_DATA_BLOCK_KINDS) {
    const entry = BUILDER_NODE_REGISTRY[kind];
    assert.ok(entry, `missing registry entry for ${kind}`);
    assert.equal(
      entry.children.type,
      "none",
      `${kind} renders from live data, so it must be a leaf like the other data-bound kinds`,
    );
  }
});

test("all native data blocks are in the shipped insert catalog", () => {
  const shipped = new Set(SHIPPED_ELEMENT_INSERT_KINDS);
  for (const kind of NATIVE_DATA_BLOCK_KINDS) {
    assert.ok(shipped.has(kind), `${kind} is not in the shipped insert catalog`);
  }
});

test("createBuilderNode seeds a VALID tree for every native data block", () => {
  for (const kind of NATIVE_DATA_BLOCK_KINDS) {
    const node = createBuilderNode(kind);
    assert.equal(node.kind, kind);
    const result = validateBuilderNodeTree([node]);
    assert.equal(result.ok, true, `${kind} seed failed validation`);
  }
});

test("seeded nodes pick their LIVE source, not a placeholder", () => {
  const hero = createBuilderNode("hero_search");
  assert.equal(
    hero.kind === "hero_search" ? hero.props.statSource : null,
    "tenant_talent_count",
  );
  const menu = createBuilderNode("menu_board");
  assert.equal(menu.kind === "menu_board" ? menu.props.title : null, "Menu");
  const grid = createBuilderNode("talent_type_grid");
  assert.equal(grid.kind === "talent_type_grid" ? grid.props.mode : null, "dynamic");
});

// ── hero_search render ──────────────────────────────────────────────────────

test("hero_search renders the headline and a real GET search form", () => {
  const html = render([heroNode()], { tenantTalentCount: 12 });
  assert.ok(html.includes('data-builder-node-kind="hero_search"'));
  assert.ok(html.includes("Find the right talent"));
  assert.ok(html.includes('method="get"'), "search must work without client JS");
  assert.ok(html.includes('action="/directory"'));
  assert.ok(html.includes('name="q"'));
});

test("hero_search: EMPTY roster renders no stat line (never '0+ talent')", () => {
  const html = render([heroNode()], { tenantTalentCount: 0 });
  assert.ok(!html.includes("hero-search-stat"), "stat line must be absent");
  assert.ok(!html.includes("0+"));
  // The rest of the hero still renders — an empty roster is not a blank page.
  assert.ok(html.includes("Find the right talent"));
});

test("hero_search: absent data source renders no stat line either", () => {
  const html = render([heroNode()], {});
  assert.ok(!html.includes("hero-search-stat"));
  assert.ok(html.includes("Find the right talent"));
});

test("hero_search: a SINGLE talent renders the derived count with its label", () => {
  const html = render([heroNode()], { tenantTalentCount: 1 });
  assert.ok(html.includes("1+"));
  assert.ok(html.includes("represented talent"));
});

// ── menu_board render ──────────────────────────────────────────────────────

test("menu_board renders an empty state when no offerings are available", () => {
  const html = render([menuNode()], { tenantId: "tenant-menu-a", menuOfferings: [] });
  assert.ok(html.includes('data-builder-node-kind="menu_board"'));
  assert.ok(html.includes("Nothing is published yet."));
  assert.ok(html.includes("Pick what works for you."));
});

test("menu_board renders items, prices, and the order island", () => {
  const html = render([menuNode()], {
    tenantId: "tenant-menu-a",
    menuOfferings: [
      {
        id: "menu-1",
        title: "Pepperoni pizza",
        description: "Tomato, mozzarella, pepperoni.",
        amountCents: 2500,
        currency: "USD",
        priceType: "flat_package",
        priceDisplay: "exact",
        kind: "service",
        unitsLeft: null,
        allowPayInPerson: true,
      },
      {
        id: "menu-2",
        title: "Catering package",
        description: null,
        amountCents: 10000,
        currency: "USD",
        priceType: "event",
        priceDisplay: "from",
        kind: "package",
        // kind='package' WITH stock: the shape the kind gate used to miss.
        unitsLeft: 0,
        allowPayInPerson: false,
      },
    ],
  });
  assert.ok(html.includes("Pepperoni pizza"));
  assert.ok(html.includes("$25"));
  assert.ok(html.includes("Catering package"));
  assert.ok(html.includes("from $100"));
  assert.ok(html.includes("Send order"));
});

test("hero_search: manual stat source ignores the derived count entirely", () => {
  const html = render(
    [
      heroNode({
        statSource: "manual",
        statItems: [{ value: "40", label: "campaigns" }],
      }),
    ],
    { tenantTalentCount: 999 },
  );
  assert.ok(html.includes("40"));
  assert.ok(html.includes("campaigns"));
  assert.ok(!html.includes("999"), "derived count must not leak into manual mode");
});

test("hero_search: hrefs are prefixed for a tenant-scoped public path", () => {
  const html = renderToStaticMarkup(
    renderBuilderNodes([heroNode()], {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      publicPathPrefix: "/t/impronta",
      dataSources: { tenantTalentCount: 3 },
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
  assert.ok(html.includes('action="/t/impronta/directory"'));
});

// ── talent_type_grid render ─────────────────────────────────────────────────

test("talent_type_grid: EMPTY roster renders the empty state, not a blank block", () => {
  const html = render([gridNode()], { talentDisciplines: [] });
  assert.ok(html.includes('data-builder-node-kind="talent_type_grid"'));
  assert.ok(html.includes("talent-type-grid-empty"));
  assert.ok(html.includes("Talent, by discipline"), "the head still renders");
});

test("talent_type_grid: a SINGLE discipline renders one card with its count", () => {
  const html = render([gridNode({ showCount: true })], {
    talentDisciplines: [{ termId: "t-models", label: "Models", count: 1 }],
  });
  assert.ok(html.includes("Models"));
  assert.ok(html.includes("/directory?tax=t-models"));
  assert.ok(html.includes("talent-type-card-count"));
  assert.ok(!html.includes("talent-type-grid-empty"));
});

test("talent_type_grid: dynamic mode with NO data falls back to authored cards", () => {
  const html = render(
    [
      gridNode({
        mode: "dynamic",
        items: [{ label: "Actors", taxonomyTermId: "t-actors" }],
      }),
    ],
    {},
  );
  assert.ok(html.includes("Actors"), "must never blank out when the source is absent");
});

test("talent_type_grid: selectedTermIds narrows the derived set", () => {
  const html = render([gridNode({ selectedTermIds: ["t-models"] })], {
    talentDisciplines: [
      { termId: "t-models", label: "Models", count: 4 },
      { termId: "t-actors", label: "Actors", count: 9 },
    ],
  });
  assert.ok(html.includes("Models"));
  assert.ok(!html.includes("Actors"));
});

test("talent_type_grid: maxItems caps the rendered cards", () => {
  const html = render([gridNode({ maxItems: 1 })], {
    talentDisciplines: [
      { termId: "t-models", label: "Models", count: 4 },
      { termId: "t-actors", label: "Actors", count: 9 },
    ],
  });
  assert.ok(html.includes("Models"));
  assert.ok(!html.includes("Actors"));
});

// ── TENANT SCOPING ──────────────────────────────────────────────────────────
// The highest-risk property of this change: one agency's roster must never
// appear on another agency's site.

test("TENANT SCOPING: a node renders EXACTLY the tenant data it was handed", () => {
  const tenantA: BuilderNodeRenderDataSources = {
    tenantTalentCount: 7,
    talentDisciplines: [{ termId: "a-models", label: "A Models", count: 7 }],
  };
  const tenantB: BuilderNodeRenderDataSources = {
    tenantTalentCount: 2,
    talentDisciplines: [{ termId: "b-dancers", label: "B Dancers", count: 2 }],
  };
  const nodes = [heroNode(), gridNode()];

  const htmlA = render(nodes, tenantA);
  assert.ok(htmlA.includes("A Models"));
  assert.ok(htmlA.includes("7+"));
  assert.ok(!htmlA.includes("B Dancers"), "tenant B's roster leaked into tenant A");
  assert.ok(!htmlA.includes("b-dancers"));

  const htmlB = render(nodes, tenantB);
  assert.ok(htmlB.includes("B Dancers"));
  assert.ok(htmlB.includes("2+"));
  assert.ok(!htmlB.includes("A Models"), "tenant A's roster leaked into tenant B");
  assert.ok(!htmlB.includes("a-models"));
});

test("TENANT SCOPING: the renderer has NO ambient data path — no dataSources, no talent", () => {
  // If either node could reach a roster by itself (a module-level client, a
  // cached fetch, a tenant id smuggled through props) this render would show
  // talent. It shows the empty state instead, which is the structural proof
  // that a cross-tenant read is not reachable from the render path.
  const html = render([heroNode(), gridNode()], {});
  assert.ok(!html.includes("hero-search-stat"));
  assert.ok(html.includes("talent-type-grid-empty"));
});

test("TENANT SCOPING: menu_board is detected before the early-return guard", () => {
  const needs = collectNativeDataBlockNeeds([menuNode()]);
  assert.equal(needs.needsTalentCount, false);
  assert.equal(needs.menuBoard, true);
  assert.equal(needs.disciplines, null);
});

test("TENANT SCOPING: foreign-tenant menu rows never survive the fetch helper", () => {
  const rows: TalentOfferingRow[] = [
    menuRow({
      id: "own-menu",
      tenant_id: "tenant-a",
      title: "Pepperoni pizza",
      description: "Tomato, mozzarella, pepperoni.",
      amount_cents: 2500,
    }),
    menuRow({
      id: "foreign-menu",
      tenant_id: "tenant-b",
      title: "Other tenant platter",
      description: "Should not survive.",
      amount_cents: 4000,
    }),
  ];
  const derived = deriveWorkspaceMenuOfferings(rows, "tenant-a");
  assert.deepEqual(derived, [
    {
      id: "own-menu",
      title: "Pepperoni pizza",
      description: "Tomato, mozzarella, pepperoni.",
      amountCents: 2500,
      currency: "USD",
      priceType: "flat_package",
      priceDisplay: "exact",
      kind: "service",
      unitsLeft: null,
      allowPayInPerson: false,
      // Added with the category strip. Kept inside the STRICT deepEqual rather
      // than loosening this to a partial match: comparing the whole array is
      // what proves the foreign-tenant row did not survive, and a partial
      // match would quietly stop proving it.
      category: null,
    },
  ]);
});

test("STOCK: unitsLeft is carried for ANY kind, not just kind='product'", () => {
  // instant-book reserves stock only when kind === "product". The live
  // seat-limited item — "Posing course - September (12 spots)" — is
  // kind='package', so a kind gate leaves exactly the offering that needs
  // enforcement unenforced: the page keeps advertising 12 seats while any
  // number of people order it, with no error anywhere.
  const rows: TalentOfferingRow[] = [
    menuRow({ id: "course", tenant_id: "t", kind: "package", inventory_qty: 12, capacity_pool_id: "p1" }),
    menuRow({ id: "merch", tenant_id: "t", kind: "product", inventory_qty: 3, capacity_pool_id: "p2" }),
    menuRow({ id: "studio", tenant_id: "t", kind: "service", inventory_qty: null }),
    menuRow({ id: "gone", tenant_id: "t", kind: "package", inventory_qty: 0, capacity_pool_id: "p3" }),
  ];
  const derived = deriveWorkspaceMenuOfferings(rows, "t");
  assert.deepEqual(
    derived.map((d) => [d.id, d.unitsLeft]),
    [
      ["course", 12],
      ["merch", 3],
      ["studio", null],
      ["gone", 0],
    ],
  );
});

test("STOCK: unitsLeft requires a POOL, not merely an inventory number", () => {
  // capacityPoolId is the authoritative "has stock" test (Capacity 0.3). An
  // inventory_qty with no pool is a stale mirror from before the migration, and
  // treating it as stock would grey out an item nothing is actually limiting.
  const rows: TalentOfferingRow[] = [
    menuRow({ id: "pooled", tenant_id: "t", inventory_qty: 0, capacity_pool_id: "pool-1" }),
    menuRow({ id: "stale", tenant_id: "t", inventory_qty: 0, capacity_pool_id: null }),
  ];
  const derived = deriveWorkspaceMenuOfferings(rows, "t");
  assert.deepEqual(
    derived.map((d) => [d.id, d.unitsLeft]),
    [
      ["pooled", 0],
      ["stale", null],
    ],
  );
});

test("STOCK: the pay-in-person policy reaches the board", () => {
  const rows: TalentOfferingRow[] = [
    menuRow({ id: "cash-ok", tenant_id: "t", allow_pay_in_person: true }),
    menuRow({ id: "card-only", tenant_id: "t", allow_pay_in_person: false }),
  ];
  const derived = deriveWorkspaceMenuOfferings(rows, "t");
  assert.deepEqual(
    derived.map((d) => [d.id, d.allowPayInPerson]),
    [
      ["cash-ok", true],
      ["card-only", false],
    ],
  );
});

test("TENANT SCOPING: deriveTalentDisciplines drops rows outside the tenant roster", () => {
  const rows: TalentTaxonomyJoinRow[] = [
    {
      talent_profile_id: "own-talent",
      taxonomy_term_id: "t-models",
      taxonomy_terms: {
        id: "t-models",
        name_i18n: { en: "Models" },
        term_type: "talent_type",
        parent_id: null,
      },
    },
    {
      // Another agency's talent. Even if a query were ever widened by mistake,
      // this row must not contribute a card, a label, or a count.
      talent_profile_id: "other-tenant-talent",
      taxonomy_term_id: "t-dancers",
      taxonomy_terms: {
        id: "t-dancers",
        name_i18n: { en: "Dancers" },
        term_type: "talent_type",
        parent_id: null,
      },
    },
  ];
  const derived = deriveTalentDisciplines({
    rows,
    rosterTalentIds: ["own-talent"],
    parentCategoryMode: false,
    maxItems: 10,
    locale: "en",
  });
  assert.deepEqual(
    derived,
    [{ termId: "t-models", label: "Models", count: 1 }],
    "only the tenant's own visible-roster talent may contribute",
  );
});

test("TENANT SCOPING: an EMPTY roster derives nothing, whatever the rows say", () => {
  const derived = deriveTalentDisciplines({
    rows: [
      {
        talent_profile_id: "other-tenant-talent",
        taxonomy_term_id: "t-dancers",
        taxonomy_terms: {
          id: "t-dancers",
          name_i18n: { en: "Dancers" },
          term_type: "talent_type",
          parent_id: null,
        },
      },
    ],
    rosterTalentIds: [],
    parentCategoryMode: false,
    maxItems: 10,
    locale: "en",
  });
  assert.deepEqual(derived, []);
});

// ── derivation parity with the frozen curated section ───────────────────────

test("deriveTalentDisciplines counts DISTINCT talent per term and sorts by count", () => {
  const term = (id: string, name: string) => ({
    id,
    name_i18n: { en: name } as Record<string, string | null>,
    term_type: "talent_type" as string | null,
    parent_id: null as string | null,
  });
  const rows: TalentTaxonomyJoinRow[] = [
    { talent_profile_id: "a", taxonomy_term_id: "m", taxonomy_terms: term("m", "Models") },
    // Same talent, same term, twice — one talent, not two.
    { talent_profile_id: "a", taxonomy_term_id: "m", taxonomy_terms: term("m", "Models") },
    { talent_profile_id: "b", taxonomy_term_id: "m", taxonomy_terms: term("m", "Models") },
    { talent_profile_id: "c", taxonomy_term_id: "d", taxonomy_terms: term("d", "Dancers") },
    // Not a discipline term — must not surface.
    {
      talent_profile_id: "c",
      taxonomy_term_id: "x",
      taxonomy_terms: { ...term("x", "Hair colour"), term_type: "attribute" },
    },
  ];
  const derived = deriveTalentDisciplines({
    rows,
    rosterTalentIds: ["a", "b", "c"],
    parentCategoryMode: false,
    maxItems: 10,
    locale: "en",
  });
  assert.deepEqual(derived, [
    { termId: "m", label: "Models", count: 2 },
    { termId: "d", label: "Dancers", count: 1 },
  ]);
});

test("deriveTalentDisciplines rolls children up to the parent category", () => {
  const rows: TalentTaxonomyJoinRow[] = [
    {
      talent_profile_id: "a",
      taxonomy_term_id: "child-1",
      taxonomy_terms: {
        id: "child-1",
        name_i18n: { en: "Runway" },
        term_type: "talent_type",
        parent_id: "parent-models",
      },
    },
    {
      talent_profile_id: "b",
      taxonomy_term_id: "child-2",
      taxonomy_terms: {
        id: "child-2",
        name_i18n: { en: "Commercial" },
        term_type: "talent_type",
        parent_id: "parent-models",
      },
    },
  ];
  const derived = deriveTalentDisciplines({
    rows,
    rosterTalentIds: ["a", "b"],
    parentCategoryMode: true,
    maxItems: 10,
    locale: "en",
    parentTerms: [{ id: "parent-models", name_i18n: { en: "Models" } }],
  });
  assert.deepEqual(derived, [
    { termId: "parent-models", label: "Models", count: 2 },
  ]);
});

test("deriveTalentDisciplines picks the locale label", () => {
  const derived = deriveTalentDisciplines({
    rows: [
      {
        talent_profile_id: "a",
        taxonomy_term_id: "m",
        taxonomy_terms: {
          id: "m",
          name_i18n: { en: "Models", es: "Modelos" },
          term_type: "talent_type",
          parent_id: null,
        },
      },
    ],
    rosterTalentIds: ["a"],
    parentCategoryMode: false,
    maxItems: 10,
    locale: "es",
  });
  assert.equal(derived[0]?.label, "Modelos");
});

/* ─────────────────────────────────────────────────────────────────────────────
 * PHASE 8B — `featured_talent` and `location_map` need collection.
 *
 * Before this, `collectNativeDataBlockNeeds` recognised neither kind, and the
 * only featured-talent fetch was keyed off a bound CONTAINER's `dataBinding`.
 * A page whose featured band is a NATIVE node and has no bound container —
 * which is every Impronta page after the Phase 8B swap — therefore resolved
 * NOTHING and rendered its empty state. These tests pin the trigger.
 * ────────────────────────────────────────────────────────────────────────── */

test("a native featured_talent node records its own source as a need", () => {
  const needs = collectNativeDataBlockNeeds([
    {
      id: "ft-1",
      kind: "featured_talent",
      props: {
        sourceMode: "manual_pick",
        manualProfileCodes: ["TAL-00036", " ", "TAL-00033"],
        limit: 4,
      },
    },
  ]);
  assert.equal(needs.featuredTalent.length, 1);
  const need = needs.featuredTalent[0]!;
  assert.equal(need.nodeId, "ft-1");
  assert.equal(need.sourceMode, "manual_pick");
  // Blank codes are dropped, real ones keep their AUTHORED ORDER — manual pick
  // is an ordered list and that order is the display order.
  assert.deepEqual(need.manualProfileCodes, ["TAL-00036", "TAL-00033"]);
  assert.equal(need.limit, 4);
});

test("two featured_talent nodes are collected SEPARATELY, keyed by node id", () => {
  // The bug this forecloses: one tree-wide card array painting the second
  // band's heading over the first band's people.
  const needs = collectNativeDataBlockNeeds([
    {
      id: "ft-a",
      kind: "featured_talent",
      props: { sourceMode: "manual_pick", manualProfileCodes: ["TAL-1"] },
    },
    {
      id: "ft-b",
      kind: "featured_talent",
      props: { sourceMode: "auto_recent", limit: 8 },
    },
  ]);
  assert.deepEqual(
    needs.featuredTalent.map((n) => n.nodeId),
    ["ft-a", "ft-b"],
  );
  assert.notEqual(
    nativeFeaturedTalentSignature(needs.featuredTalent[0]!),
    nativeFeaturedTalentSignature(needs.featuredTalent[1]!),
    "a manual pick and an auto band must never share one fetch",
  );
});

test("featured_talent limit is clamped to what the grid can render", () => {
  const needs = collectNativeDataBlockNeeds([
    { id: "hi", kind: "featured_talent", props: { limit: 999 } },
    { id: "lo", kind: "featured_talent", props: { limit: 0 } },
  ]);
  assert.equal(needs.featuredTalent[0]!.limit, 12);
  assert.equal(needs.featuredTalent[1]!.limit, 1);
});

test("only a roster-sourced location_map asks for the tenant city list", () => {
  assert.equal(
    collectNativeDataBlockNeeds([
      { id: "lm", kind: "location_map", props: { source: "roster_cities" } },
    ]).needsTalentLocations,
    true,
  );
  // A manually authored map renders its own `items` and must NOT trigger a
  // roster read it has no use for.
  assert.equal(
    collectNativeDataBlockNeeds([
      {
        id: "lm",
        kind: "location_map",
        props: { source: "manual", items: [{ label: "Tulum" }] },
      },
    ]).needsTalentLocations,
    false,
  );
});

test("a tree with no native featured_talent or location_map asks for neither", () => {
  const needs = collectNativeDataBlockNeeds([
    { id: "h", kind: "heading", props: { text: "Hello", level: 2 } },
  ]);
  assert.deepEqual(needs.featuredTalent, []);
  assert.equal(needs.needsTalentLocations, false);
});

test("a native featured_talent node reads its OWN per-node cards", () => {
  // The renderer contract behind `featuredTalentProfilesByNodeId`: the per-node
  // entry wins over the shared tree-wide array, so two bands cannot swap
  // rosters. Mirrors the directory node's own guarantee.
  const card = (profileCode: string, displayName: string) => ({
    id: profileCode,
    profileCode,
    slugPart: profileCode.toLowerCase(),
    displayName,
    primaryTalentTypeLabel: null,
    secondaryTalentTypeLabel: null,
    locationLabel: null,
    languages: [],
    availabilityLabel: null,
    parentCategoryLabel: null,
    isFeatured: true,
    thumbnailUrl: null,
    bookable: false,
  });
  const dataSources = {
    featuredTalentProfiles: [card("TAL-SHARED", "Shared Person")],
    featuredTalentProfilesByNodeId: {
      "ft-scoped": [card("TAL-SCOPED", "Scoped Person")],
    },
  } as unknown as BuilderNodeRenderDataSources;

  const scoped = renderToStaticMarkup(
    renderBuilderNodes(
      [{ id: "ft-scoped", kind: "featured_talent", props: { limit: 4 } }],
      { dataSources },
    ) as React.ReactElement,
  );
  assert.ok(scoped.includes("Scoped Person"));
  assert.ok(
    !scoped.includes("Shared Person"),
    "the per-node entry must win over the shared array",
  );

  // A node with no entry of its own still falls back to the shared array
  // rather than blanking out.
  const fallback = renderToStaticMarkup(
    renderBuilderNodes(
      [{ id: "ft-other", kind: "featured_talent", props: { limit: 4 } }],
      { dataSources },
    ) as React.ReactElement,
  );
  assert.ok(fallback.includes("Shared Person"));
});
