/**
 * WS7 native data vocabulary — the safety contract for `hero_search` and
 * `talent_type_grid` in AI generation.
 *
 * Three properties are locked here:
 *   1. a model-emitted tree containing both kinds coerces, VALIDATES, and
 *      round-trips through the same gate every hand-placed tree passes;
 *   2. a model attempt to inject data selectors, ids, urls, or a tenant scope
 *      into either kind is stripped — nothing it supplies can address a query;
 *   3. the allowlist change admits ONLY these two kinds and still excludes
 *      `section_embed` and every other deliberately-excluded kind.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { coerceToSections } from "./generate-nodes";
import {
  GENERATION_ALLOWED_KINDS,
  NATIVE_DATA_BLOCK_FORBIDDEN_PROPS,
} from "./generation-allowed-kinds";
import { BUILDER_NODE_REGISTRY } from "@/lib/site-admin/builder-node/registry";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { buildHeadingOutlineFromBuilderTree } from "@/lib/site-admin/builder-node/freeform-heading-outline";
import type { BuilderNode, BuilderNodeTree } from "@/lib/site-admin/builder-node/types";

function collect(tree: BuilderNodeTree): BuilderNode[] {
  const out: BuilderNode[] = [];
  const walk = (n: BuilderNode) => {
    out.push(n);
    const kids = (n as { children?: BuilderNode[] }).children;
    if (Array.isArray(kids)) kids.forEach(walk);
  };
  tree.forEach(walk);
  return out;
}

function findKind(tree: BuilderNodeTree, kind: string): Record<string, unknown> {
  const node = collect(tree).find((n) => n.kind === kind);
  assert.ok(node, `no ${kind} node survived coercion`);
  return (node as { props: Record<string, unknown> }).props;
}

/** A well-formed page the model could plausibly emit. */
const CLEAN_PAGE = {
  sections: [
    {
      kind: "section",
      label: "Search hero",
      children: [
        {
          kind: "hero_search",
          props: {
            eyebrow: "Representing talent since 2009",
            headline: "Find the right face for",
            highlight: "the brief on your desk",
            subheadline: "Search the roster, or send the brief and we will shortlist.",
            searchPlaceholder: "Search by discipline or city",
            searchSubmitLabel: "Search",
            primaryCtaLabel: "Browse the roster",
            secondaryCtaLabel: "Start an inquiry",
            chips: [{ label: "Models" }, { label: "Actors" }],
            statSource: "tenant_talent_count",
            statCountLabel: "represented talent",
            layout: "centered",
            style: { paddingY: "xl", minHeight: "76svh" },
          },
        },
      ],
    },
    {
      kind: "section",
      label: "Disciplines",
      children: [
        {
          kind: "talent_type_grid",
          props: {
            eyebrow: "Who we represent",
            headline: "Talent, by discipline",
            mode: "dynamic",
            maxItems: 8,
            columns: 4,
            showCount: true,
            seeAllLabel: "View the full roster",
            style: { paddingY: "xl" },
          },
        },
      ],
    },
  ],
};

test("a generated tree with the native data kinds coerces, validates, and round-trips", () => {
  const coerced = coerceToSections(CLEAN_PAGE);
  const validated = validateBuilderNodeTree(coerced);
  assert.equal(validated.ok, true, "validation dropped nodes from the generated tree");

  const kinds = collect(validated.tree).map((n) => n.kind);
  assert.ok(kinds.includes("hero_search"), "hero_search survived");
  assert.ok(kinds.includes("talent_type_grid"), "talent_type_grid survived");

  // Round-trip: serializing and revalidating the stored tree is a no-op.
  const reparsed = JSON.parse(JSON.stringify(validated.tree)) as BuilderNodeTree;
  const again = validateBuilderNodeTree(reparsed);
  assert.equal(again.ok, true, "round-tripped tree still validates");
  assert.deepEqual(again.tree, validated.tree, "round-trip is byte-stable");

  // The authored copy actually reached the node (coercion is not a black hole).
  const hero = findKind(validated.tree, "hero_search");
  assert.equal(hero.headline, "Find the right face for");
  assert.equal(hero.statSource, "tenant_talent_count");
  assert.deepEqual(hero.chips, [{ label: "Models" }, { label: "Actors" }]);
  const grid = findKind(validated.tree, "talent_type_grid");
  assert.equal(grid.mode, "dynamic");
  assert.equal(grid.maxItems, 8);
});

test("hero_search headline is the page H1, so the outline sees exactly one", () => {
  const validated = validateBuilderNodeTree(coerceToSections(CLEAN_PAGE));
  const outline = buildHeadingOutlineFromBuilderTree(validated.tree);
  const h1s = outline.filter((h) => h.level === 1);
  assert.equal(h1s.length, 1, "exactly one level-1 heading");
  assert.equal(h1s[0]!.text, "Find the right face for");
  assert.ok(
    outline.some((h) => h.level === 2 && h.text === "Talent, by discipline"),
    "talent_type_grid contributes its H2",
  );
});

test("model-supplied data selectors, ids, urls and tenant scope are all stripped", () => {
  const hostile = {
    sections: [
      {
        kind: "section",
        children: [
          {
            kind: "hero_search",
            props: {
              headline: "Find talent",
              // Would repoint the real GET search form at an attacker route.
              searchActionHref: "https://evil.example/collect",
              primaryCtaHref: "javascript:alert(1)",
              secondaryCtaHref: "/somewhere-else",
              chips: [{ label: "Models", href: "/directory?tax=stolen-term-id" }],
              // Not in the schema at all — must not appear anywhere.
              tenantId: "00000000-0000-0000-0000-000000000000",
              dataSources: { tenantTalentCount: 9999 },
              statSource: "tenant_talent_count",
            },
          },
          {
            kind: "talent_type_grid",
            props: {
              headline: "Disciplines",
              mode: "dynamic",
              // The actual query selector, threaded to fetchTenantTalentDisciplines.
              selectedTermIds: ["11111111-1111-1111-1111-111111111111"],
              seeAllHref: "https://evil.example/roster",
              tenantId: "00000000-0000-0000-0000-000000000000",
              items: [
                {
                  label: "Models",
                  taxonomyTermId: "22222222-2222-2222-2222-222222222222",
                  href: "https://evil.example/models",
                  imageUrl: "https://evil.example/tracker.gif",
                  imageAlt: "x",
                  imagePosition: "50% 50%",
                },
              ],
            },
          },
        ],
      },
    ],
  };

  const validated = validateBuilderNodeTree(coerceToSections(hostile));
  assert.equal(validated.ok, true, "hostile props are stripped, not node-dropping");

  const serialized = JSON.stringify(validated.tree);
  for (const marker of [
    "evil.example",
    "javascript:",
    "stolen-term-id",
    "00000000-0000-0000-0000-000000000000",
    "11111111-1111-1111-1111-111111111111",
    "22222222-2222-2222-2222-222222222222",
    "/somewhere-else",
  ]) {
    assert.ok(!serialized.includes(marker), `hostile value survived coercion: ${marker}`);
  }

  // And the forbidden prop NAMES are absent from both nodes, whatever the value.
  for (const kind of ["hero_search", "talent_type_grid"]) {
    const props = findKind(validated.tree, kind);
    for (const forbidden of NATIVE_DATA_BLOCK_FORBIDDEN_PROPS) {
      assert.ok(!(forbidden in props), `${kind} kept forbidden prop ${forbidden}`);
    }
    const items = Array.isArray(props.items) ? props.items : [];
    for (const item of items as Array<Record<string, unknown>>) {
      for (const forbidden of NATIVE_DATA_BLOCK_FORBIDDEN_PROPS) {
        assert.ok(!(forbidden in item), `${kind} item kept forbidden prop ${forbidden}`);
      }
    }
  }
});

test("a manual grid the model gave no usable cards for falls back to the real roster", () => {
  const tree = validateBuilderNodeTree(
    coerceToSections({
      sections: [
        {
          kind: "section",
          children: [
            {
              kind: "talent_type_grid",
              props: { headline: "Disciplines", mode: "manual", items: [{ description: "no label" }] },
            },
          ],
        },
      ],
    }),
  );
  const grid = findKind(tree.tree, "talent_type_grid");
  assert.equal(grid.mode, "dynamic", "empty manual grid becomes roster-derived");
  assert.ok(!("items" in grid), "no empty items array left behind");
});

test("a native data block with no headline is dropped rather than rendering an empty band", () => {
  const coerced = coerceToSections({
    sections: [
      {
        kind: "section",
        children: [
          { kind: "hero_search", props: { subheadline: "no headline" } },
          { kind: "talent_type_grid", props: { mode: "dynamic" } },
        ],
      },
    ],
  });
  const kinds = collect(coerced).map((n) => n.kind);
  assert.ok(!kinds.includes("hero_search"));
  assert.ok(!kinds.includes("talent_type_grid"));
});

test("the allowlist admits exactly the two native kinds and still excludes section_embed", () => {
  const allowed = new Set<string>(GENERATION_ALLOWED_KINDS as ReadonlyArray<string>);
  assert.ok(allowed.has("hero_search"));
  assert.ok(allowed.has("talent_type_grid"));

  // section_embed is excluded ON PURPOSE (id-referential + re-embeds the legacy
  // curated section tree WS7 Phase 3 deletes). Adding it would invest generation
  // quality in a dying format.
  assert.ok(!allowed.has("section_embed"), "section_embed must stay out of generation");
  for (const excluded of ["tabs", "carousel", "masonry", "embed", "video", "code", "nav", "social_links", "social_post", "social_feed", "rich_text"]) {
    assert.ok(!allowed.has(excluded), `${excluded} must stay out of generation`);
  }
  // Every allowed kind is still a real registry kind.
  for (const kind of GENERATION_ALLOWED_KINDS) {
    assert.ok(kind in BUILDER_NODE_REGISTRY, `unknown kind in generation set: ${kind}`);
  }
});

test("a model-emitted section_embed is dropped by coercion", () => {
  const coerced = coerceToSections({
    sections: [
      {
        kind: "section",
        children: [
          { kind: "section_embed", props: { sectionTypeKey: "hero_search", config: {} } },
          { kind: "paragraph", props: { text: "Real copy survives." } },
        ],
      },
    ],
  });
  const kinds = collect(coerced).map((n) => n.kind);
  assert.ok(!kinds.includes("section_embed"), "section_embed never reaches a stored tree");
  assert.ok(kinds.includes("paragraph"), "siblings are unaffected");
});
