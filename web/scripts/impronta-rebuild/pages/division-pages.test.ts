/**
 * division-pages.test.ts — validates the five W4b division landing trees
 * (mirrors src/lib/site-admin/builder-node/page-designs/page-designs.test.ts).
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *        npx tsx --test scripts/impronta-rebuild/pages/division-pages.test.ts
 *
 * Covers, per page:
 *   - validateBuilderNodeTree passes with zero issues (registry + schema +
 *     child-policy + depth + unique-id checks);
 *   - the LIVE ROSTER embed is a `directory` section whose config parses
 *     against directorySchemaV1 AND is genuinely scoped by_talent_type
 *     (never an unfiltered grid pretending to be filtered);
 *   - every button href is a real destination (no dead CTAs);
 *   - every image src is a W5 image slot with real alt text;
 *   - SEO metadata contract (canonical /p/<slug>, indexable, in sitemap);
 *   - a structural snapshot of the top-level section flow.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { directorySchemaV1 } from "@/lib/site-admin/sections/directory/schema";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { IMAGE_SLOT_PREFIX, type DivisionPage } from "../shared-divisions";
import { fashionModelsPage } from "./fashion-models";
import { hostsPromotersPage } from "./hosts-promoters";
import { performersPage } from "./performers";
import { musicDjsPage } from "./music-djs";
import { chefsCulinaryPage } from "./chefs-culinary";

const PAGES: DivisionPage[] = [
  fashionModelsPage,
  hostsPromotersPage,
  performersPage,
  musicDjsPage,
  chefsCulinaryPage,
];

/** The only hrefs division pages may link to (task contract: no dead CTAs). */
const ALLOWED_HREF_PREFIXES = ["/directory", "/inquire", "/register", "/p/"];

function walk(nodes: BuilderNode[], visit: (node: BuilderNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if ("children" in node && Array.isArray(node.children)) {
      walk(node.children, visit);
    }
  }
}

test("division pages: five pages, unique slugs, expected slugs", () => {
  assert.equal(PAGES.length, 5);
  const slugs = PAGES.map((p) => p.slug);
  assert.deepEqual(slugs, [
    "fashion-models",
    "hosts-promoters",
    "performers",
    "music-djs",
    "chefs-culinary",
  ]);
  assert.equal(new Set(slugs).size, 5);
});

for (const page of PAGES) {
  test(`division pages: ${page.slug} tree passes validateBuilderNodeTree`, () => {
    const result = validateBuilderNodeTree(page.tree);
    assert.deepEqual(
      result.issues,
      [],
      `validation issues on ${page.slug}: ${JSON.stringify(result.issues, null, 2)}`,
    );
    assert.equal(result.ok, true);
    assert.equal(result.tree.length, page.tree.length);
  });

  test(`division pages: ${page.slug} roster embed is a scoped directory`, () => {
    const embeds: Array<Extract<BuilderNode, { kind: "section_embed" }>> = [];
    walk(page.tree, (node) => {
      if (node.kind === "section_embed") embeds.push(node);
    });
    const rosters = embeds.filter(
      (e) => e.props.sectionTypeKey === "directory",
    );
    assert.equal(
      rosters.length,
      1,
      `${page.slug} must carry exactly one live roster directory embed`,
    );
    const parsed = directorySchemaV1.parse(rosters[0].props.config);
    assert.equal(parsed.scope, "by_talent_type");
    assert.ok(
      parsed.talentTypeKeys.length > 0,
      "roster embed must be genuinely filtered (non-empty talentTypeKeys)",
    );
    assert.equal(parsed.showHeading, false);
    assert.equal(parsed.aiMode, "off");
    assert.ok(parsed.emptyStateText && parsed.emptyStateText.length > 0);
  });

  test(`division pages: ${page.slug} has no dead CTAs`, () => {
    const hrefs: string[] = [];
    walk(page.tree, (node) => {
      if (node.kind === "button") hrefs.push(node.props.href);
    });
    assert.ok(hrefs.length >= 6, "expected a full CTA complement");
    for (const href of hrefs) {
      assert.ok(
        ALLOWED_HREF_PREFIXES.some((prefix) => href.startsWith(prefix)),
        `unexpected href "${href}" on ${page.slug}`,
      );
    }
  });

  test(`division pages: ${page.slug} images are W5 slots with real alt text`, () => {
    const images: Array<Extract<BuilderNode, { kind: "image" }>> = [];
    walk(page.tree, (node) => {
      if (node.kind === "image") images.push(node);
    });
    assert.ok(images.length >= 2, "expected full-bleed photography");
    const seenSlots = new Set<string>();
    for (const image of images) {
      assert.ok(
        image.props.src.startsWith(IMAGE_SLOT_PREFIX),
        `image ${image.id} src must be an IMAGE_SLOT placeholder`,
      );
      seenSlots.add(image.props.src.slice(IMAGE_SLOT_PREFIX.length));
      assert.ok(
        (image.props.alt ?? "").trim().length >= 20,
        `image ${image.id} needs real alt text`,
      );
    }
    assert.deepEqual(
      [...seenSlots].sort(),
      [...page.imageSlots].sort(),
      `${page.slug} imageSlots manifest must match the slots used in the tree`,
    );
  });

  test(`division pages: ${page.slug} SEO metadata contract`, () => {
    assert.equal(page.seo.canonical_url, `/p/${page.slug}`);
    assert.equal(page.seo.noindex, false);
    assert.equal(page.seo.include_in_sitemap, true);
    assert.ok(page.seo.meta_title.length > 10 && page.seo.meta_title.length <= 70);
    assert.ok(
      page.seo.meta_description.length > 50 &&
        page.seo.meta_description.length <= 220,
    );
    assert.ok(page.seo.og_title.length > 0);
    assert.ok(page.seo.og_description.length > 0);
  });

  test(`division pages: ${page.slug} copy respects language rules`, () => {
    const texts: string[] = [];
    walk(page.tree, (node) => {
      if (node.kind === "heading" || node.kind === "paragraph") {
        texts.push(node.props.text);
      }
      if (node.kind === "button") texts.push(node.props.label);
    });
    const all = [
      ...texts,
      page.seo.meta_title,
      page.seo.meta_description,
      page.seo.og_title,
      page.seo.og_description,
    ].join("\n");
    assert.ok(!all.includes("—"), "no em dashes in user-facing copy");
    assert.ok(!/\bbuyers?\b/i.test(all), 'never "buyer" for talent language');
    assert.ok(!/\bcart\b/i.test(all), 'never "cart" for talent language');
  });
}

// ── structural snapshot: the section flow of every page, pinned ──────────────
test("division pages: section-flow snapshot", () => {
  const flows = Object.fromEntries(
    PAGES.map((page) => [
      page.slug,
      page.tree.map(
        (node) =>
          `${node.kind}:${
            ("props" in node &&
              (node.props as { layerLabel?: string }).layerLabel) ||
            node.id
          }`,
      ),
    ]),
  );
  assert.deepEqual(flows, {
    "fashion-models": [
      "container:Hero (full-bleed)",
      "container:Editorial split",
      "container:Use cases",
      "container:Stats band",
      "container:Live roster",
      "container:Full-bleed plate",
      "container:Other divisions",
      "container:Closing CTA",
    ],
    "hosts-promoters": [
      "container:Hero (full-bleed)",
      "container:Use cases",
      "container:Occasions",
      "container:Editorial split",
      "container:Live roster",
      "container:Other divisions",
      "container:Closing CTA",
    ],
    performers: [
      "container:Hero (full-bleed)",
      "container:Full-bleed plate",
      "container:Use cases",
      "container:Editorial split",
      "container:Live roster",
      "container:Other divisions",
      "container:Closing CTA",
    ],
    "music-djs": [
      "container:Hero (full-bleed)",
      "container:Editorial split",
      "container:Occasions",
      "container:Stats band",
      "container:Live roster",
      "container:Full-bleed plate",
      "container:Other divisions",
      "container:Closing CTA",
    ],
    "chefs-culinary": [
      "container:Hero (full-bleed)",
      "container:Use cases",
      "container:Editorial split",
      "container:Full-bleed plate",
      "container:Live roster",
      "container:Other divisions",
      "container:Closing CTA",
    ],
  });
});
