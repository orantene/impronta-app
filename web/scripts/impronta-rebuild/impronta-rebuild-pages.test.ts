/**
 * Impronta rebuild — validation for the 9 core page trees (workstream W4a).
 *
 * Mirrors page-designs.test.ts: every tree must pass validateBuilderNodeTree,
 * carry collision-free ids, and keep its section structure stable (snapshotted
 * below). Adds the rebuild's own invariants: SEO metadata shape, image-slot
 * placeholders with written alt text, an href allow-list (no dead CTAs), and
 * the copy rules (no em dashes, never "buyer"/"cart").
 *
 * Run: npx tsx --test scripts/impronta-rebuild/impronta-rebuild-pages.test.ts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

import { collectImageSlots, IMAGE_SLOT_PREFIX, type ImprontaRebuildPage } from "./shared";
import { homePage } from "./pages/home";
import { aboutPage } from "./pages/about";
import { contactPage } from "./pages/contact";
import { forClientsPage } from "./pages/for-clients";
import { becomeAModelPage } from "./pages/become-a-model";
import { faqPage } from "./pages/faq";
import { termsPage } from "./pages/terms";
import { privacyPage } from "./pages/privacy";
import { notFoundPage } from "./pages/not-found";
import { showPage } from "./pages/show";
import { studioPage } from "./pages/studio";

const PAGES: ReadonlyArray<ImprontaRebuildPage> = [
  homePage,
  aboutPage,
  contactPage,
  forClientsPage,
  becomeAModelPage,
  faqPage,
  termsPage,
  privacyPage,
  notFoundPage,
  showPage,
  studioPage,
];

function walk(nodes: BuilderNode[], visit: (node: BuilderNode) => void): void {
  for (const node of nodes) {
    visit(node);
    if ("children" in node && Array.isArray(node.children)) {
      walk(node.children, visit);
    }
  }
}

/**
 * PHASE 8B — the seed sources must not be able to re-create a `section_embed`.
 *
 * `verify:no-embed-bridges` proves the same thing three ways, but it needs
 * network + service-role DB access and so cannot run in CI. This is the part of
 * that gate a unit test can hold: if a future edit reintroduces a bridge in a
 * page tree, the next re-seed would publish it straight to the live site (a
 * published freeform page has no draft layer), and this catches it first.
 */
test("impronta-rebuild: no page tree carries a section_embed bridge", () => {
  const offenders: string[] = [];
  for (const page of PAGES) {
    walk(page.tree, (node) => {
      if (node.kind === "section_embed") {
        offenders.push(`${page.slug}:${node.id}`);
      }
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `section_embed bridges must not survive in a page body: ${offenders.join(", ")}`,
  );
});

function sectionSignature(node: BuilderNode): string {
  const label = (node.props as { layerLabel?: string | null }).layerLabel;
  return `${node.kind}:${label ?? node.id}`;
}

test("impronta-rebuild: eleven pages, unique slugs, expected set", () => {
  assert.equal(PAGES.length, 11);
  const slugs = PAGES.map((page) => page.slug);
  assert.deepEqual(
    [...slugs].sort(),
    ["404", "about", "become-a-model", "contact", "faq", "for-clients", "home", "privacy", "show", "studio", "terms"],
  );
  assert.equal(new Set(slugs).size, slugs.length);
});

test("impronta-rebuild: every tree passes validateBuilderNodeTree", () => {
  for (const page of PAGES) {
    const result = validateBuilderNodeTree(page.tree);
    assert.ok(
      result.ok,
      `${page.slug} failed validation: ${
        result.ok ? "" : result.issues.map((issue) => `${issue.path}: ${issue.message}`).join(" | ")
      }`,
    );
  }
});

test("impronta-rebuild: ids are collision-free within each tree", () => {
  for (const page of PAGES) {
    const ids: string[] = [];
    walk(page.tree, (node) => ids.push(node.id));
    assert.equal(new Set(ids).size, ids.length, `${page.slug} has duplicate node ids`);
  }
});

// Section-structure snapshot — the top-level flow of every page. A change here
// is a deliberate design change; update the expectation alongside it.
test("impronta-rebuild: section structure snapshot", () => {
  const structure = Object.fromEntries(
    PAGES.map((page) => [page.slug, page.tree.map(sectionSignature)]),
  );
  assert.deepEqual(structure, {
    home: [
      "container:Hero",
      // Phase 8B — the NATIVE `marquee` kind; this was a `section_embed`
      // bridge to the frozen curated section.
      "marquee:Discipline Marquee",
      "container:Featured Talent Section",
      "container:Divisions",
      "container:Markets Section",
      "container:Editorial plate",
      "container:The show",
      "container:How it works",
      "container:Social proof",
      "container:Stats",
      "container:The studio",
      "container:Two paths",
      "container:Events",
      "container:Closing CTA band",
    ],
    about: [
      "container:Hero",
      "container:Story",
      "container:Values",
      "container:Editorial plate",
      "container:Divisions",
      "container:Stats",
      "container:Closing CTA band",
    ],
    contact: [
      "container:Hero",
      "container:Contact",
      "container:What happens next",
      "container:Closing CTA band",
    ],
    "for-clients": [
      "container:Hero",
      "container:Occasions",
      "container:Agency-managed",
      "container:Process",
      "container:Editorial plate",
      "container:Divisions",
      "container:Social proof",
      "container:FAQ teaser",
      "container:Closing CTA band",
    ],
    "become-a-model": [
      "container:Hero",
      "container:What representation means",
      "container:Who we look for",
      "container:Editorial plate",
      "container:How applying works",
      "container:What to prepare",
      "container:FAQ teaser",
      "container:Closing CTA band",
    ],
    faq: [
      "container:Hero",
      "container:Client FAQ",
      "container:Talent FAQ",
      "container:Closing CTA band",
    ],
    terms: ["container:Hero", "container:Terms", "container:Closing CTA band"],
    privacy: ["container:Hero", "container:Privacy", "container:Closing CTA band"],
    "404": ["container:Not found"],
    studio: [
      "container:Hero",
      "container:Sessions",
      "container:Booking",
      "container:Book a session",
      "container:Gallery",
      "container:For production teams",
      "container:Closing CTA band",
    ],
    show: [
      "container:Hero",
      "container:The production",
      "container:For venues",
      "container:Casting",
      "container:Live roster",
      "container:Closing CTA band",
    ],
  });
});

test("impronta-rebuild: SEO metadata is complete and consistent", () => {
  for (const page of PAGES) {
    const { seo } = page;
    assert.ok(seo.meta_title.length > 0 && seo.meta_title.length <= 70, `${page.slug} meta_title length`);
    assert.ok(seo.meta_description.length > 0 && seo.meta_description.length <= 220, `${page.slug} meta_description length`);
    assert.ok(seo.og_title.length > 0, `${page.slug} og_title`);
    assert.ok(seo.og_description.length > 0, `${page.slug} og_description`);
    assert.equal(seo.canonical_url, `/p/${page.slug}`, `${page.slug} canonical`);
    // Two pages are deliberately not indexable, for different reasons: the 404
    // never should be, and `show` is an unannounced production the owner wants
    // reachable (she can send the link to a venue) but not findable until she
    // says the show is public. Flipping it is one field.
    if (page.slug === "404" || page.slug === "show") {
      assert.equal(seo.noindex, true, `${page.slug} must be noindex`);
      assert.equal(seo.include_in_sitemap, false, `${page.slug} stays out of the sitemap`);
    } else {
      assert.equal(seo.noindex, false, `${page.slug} must be indexable`);
      assert.equal(seo.include_in_sitemap, true, `${page.slug} belongs in the sitemap`);
    }
  }
  const jsonLd = homePage.seo.json_ld as { "@type"?: string } | undefined;
  assert.ok(jsonLd, "home carries JSON-LD");
  assert.equal(jsonLd?.["@type"], "Organization", "home JSON-LD is an Organization schema");
  for (const page of PAGES) {
    if (page.slug !== "home") {
      assert.equal(page.seo.json_ld, undefined, `${page.slug} carries no JSON-LD`);
    }
  }
});

test("impronta-rebuild: every image is a W5 slot placeholder with alt text", () => {
  for (const page of PAGES) {
    walk(page.tree, (node) => {
      if (node.kind !== "image") return;
      const props = node.props as { src: string; alt?: string };
      assert.ok(
        props.src.startsWith(IMAGE_SLOT_PREFIX),
        `${page.slug}/${node.id}: image src must be an IMAGE_SLOT placeholder (got "${props.src}")`,
      );
      assert.ok(
        (props.alt ?? "").trim().length >= 10,
        `${page.slug}/${node.id}: image needs real alt text`,
      );
    });
    // Slot names are collision-free per page and page-prefixed for W5.
    const slots = collectImageSlots(page.tree);
    for (const slot of slots) {
      assert.match(slot, /^[a-z0-9-]+$/, `${page.slug} slot "${slot}" naming`);
    }
  }
});

// Every button href must be a real destination — no dead CTAs.
/**
 * `#anchor` is allowed because a hero CTA that jumps to a form further down the
 * SAME page is a real destination, not a dead link. The section id still has to
 * exist - "every in-page anchor resolves" below is what checks that.
 */
const ALLOWED_HREF = /^(\/directory|\/contact|\/register|\/p\/[a-z0-9-]+|mailto:[^\s]+|tel:\+[0-9]+|#[a-z0-9-]+|\/)$/;

/**
 * An in-page anchor is only a real destination if the id is really on the page.
 * `#rb-show-casting` in the show hero is a CTA a visitor clicks expecting to
 * land on the casting form; a typo would scroll nowhere and look like a dead
 * button. Nothing else in the stack checks this - the renderer emits whatever
 * href it is given.
 */
test("impronta-rebuild: every in-page anchor resolves to a node on that page", () => {
  for (const page of PAGES) {
    const ids = new Set<string>();
    walk(page.tree, (node) => ids.add(node.id));
    walk(page.tree, (node) => {
      const href = (node.props as { href?: unknown }).href;
      if (typeof href !== "string" || !href.startsWith("#")) return;
      assert.ok(
        ids.has(href.slice(1)),
        `${page.slug}/${node.id}: anchor "${href}" has no matching node on the page`,
      );
    });
  }
});

test("impronta-rebuild: every button href points at a real destination", () => {
  for (const page of PAGES) {
    walk(page.tree, (node) => {
      if (node.kind !== "button") return;
      const { href } = node.props as { href: string };
      assert.match(href, ALLOWED_HREF, `${page.slug}/${node.id}: href "${href}" is not an allowed destination`);
    });
  }
});

// Copy rules: no em dashes in user-facing text; talent are never "buyer"/"cart" language.
test("impronta-rebuild: copy rules (no em dashes, no buyer/cart language)", () => {
  const forbiddenWords = /\b(buyers?|carts?)\b/i;
  const collectStrings = (value: unknown, out: string[]): void => {
    if (typeof value === "string") {
      out.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry) => collectStrings(entry, out));
      return;
    }
    if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach((entry) => collectStrings(entry, out));
    }
  };
  for (const page of PAGES) {
    const strings: string[] = [];
    walk(page.tree, (node) => {
      const props = node.props as Record<string, unknown>;
      // User-facing copy props only (style values may carry CSS strings).
      for (const key of ["text", "label", "title", "placeholder"]) {
        if (typeof props[key] === "string") strings.push(props[key] as string);
      }
      for (const key of ["fields", "config"]) {
        if (props[key]) collectStrings(props[key], strings);
      }
    });
    collectStrings(Object.values(page.seo), strings);
    for (const text of strings) {
      assert.ok(!text.includes("—"), `${page.slug}: em dash in copy "${text.slice(0, 60)}"`);
      assert.ok(!forbiddenWords.test(text), `${page.slug}: forbidden word in "${text.slice(0, 60)}"`);
    }
  }
});
