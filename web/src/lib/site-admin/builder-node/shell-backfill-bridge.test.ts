/**
 * shell-backfill-bridge.test.ts — WS-A A8. Pure tests (node:test +
 * node:assert) for the legacy header/footer → freeform `builderTree`
 * conversion the shell backfill relies on.
 *
 * The backfill seeds the shell row from real tenant identity/nav data, bakes a
 * base `builderTree` via `buildLegacySectionBuilderTree`, then ENRICHES it via
 * `enrichShellBuilderTree` so a backfilled shell opens against the tenant's REAL
 * content: a `nav` node from the header nav items, a `social_links` node from
 * the footer social array, plus brand logo + footer nav — APPENDED to the
 * role-bound brand/CTA/tagline children the base derivation already produces.
 *
 * These tests feed a FAKE legacy header + footer (exactly the prop shape the
 * backfill writes) and assert the expected nav / social / brand nodes appear,
 * AND that the base role-bound children are preserved (so the bespoke
 * header/footer components keep working).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNode } from "./types";
import {
  buildLegacySectionBuilderTree,
  type LegacySnapshotSlot,
} from "./snapshot-slot-bridge";
import {
  buildShellHeaderFreeformChildren,
  buildShellFooterFreeformChildren,
  enrichShellBuilderTree,
} from "./shell-builder-tree";
import { validateBuilderNodeTree } from "./validate";

// The exact header/footer prop shapes site-shell-backfill-action.ts writes.
const FAKE_HEADER_PROPS = {
  brand: { label: "Studio Aurora", href: "/", logoSrc: "https://cdn/logo.png" },
  navItems: [
    { label: "Talent", href: "/talent" },
    { label: "About", href: "/about" },
  ],
  primaryCta: { label: "Book now", href: "/book" },
};

const FAKE_FOOTER_PROPS = {
  brand: { label: "Studio Aurora", tagline: "Casting the extraordinary." },
  columns: [
    {
      heading: "Site",
      links: [
        { label: "Talent", href: "/talent" },
        { label: "Contact", href: "/contact" },
      ],
    },
  ],
  social: [
    { platform: "instagram", href: "https://instagram.com/aurora" },
    // "twitter" must normalize to the canonical "x".
    { platform: "twitter", href: "https://x.com/aurora" },
    // Unknown platform is dropped.
    { platform: "myspace", href: "https://myspace.com/aurora" },
  ],
};

function findByKind(nodes: BuilderNode[], kind: string): BuilderNode | undefined {
  return nodes.find((n) => n.kind === kind);
}

// ── header freeform children ─────────────────────────────────────────────────────

test("[A8] header freeform children: logo image + nav from navItems", () => {
  const children = buildShellHeaderFreeformChildren("hid", FAKE_HEADER_PROPS);

  const image = findByKind(children, "image");
  assert.ok(image, "expected a logo image node");
  assert.equal((image!.props as { src: string }).src, "https://cdn/logo.png");

  const nav = findByKind(children, "nav");
  assert.ok(nav, "expected a nav node from navItems");
  const navProps = nav!.props as {
    brand?: string;
    links: Array<{ label: string; href: string }>;
  };
  assert.equal(navProps.links.length, 2);
  assert.deepEqual(navProps.links.map((l) => l.label), ["Talent", "About"]);
  assert.equal(navProps.brand, "Studio Aurora");
});

test("[A8] header with no nav / no logo yields NO freeform children (back-compat)", () => {
  const children = buildShellHeaderFreeformChildren("hid", {
    brand: { label: "Brandless" },
  });
  assert.equal(children.length, 0);
});

// ── footer freeform children ──────────────────────────────────────────────────────

test("[A8] footer freeform children: footer nav + social_links", () => {
  const children = buildShellFooterFreeformChildren("fid", FAKE_FOOTER_PROPS);

  const nav = findByKind(children, "nav");
  assert.ok(nav, "expected a footer nav node from column links");
  const navLinks = (nav!.props as { links: Array<{ label: string }> }).links;
  assert.deepEqual(navLinks.map((l) => l.label), ["Talent", "Contact"]);

  const social = findByKind(children, "social_links");
  assert.ok(social, "expected a social_links node");
  const socialLinks = (social!.props as {
    links: Array<{ platform: string; href: string }>;
  }).links;
  // instagram kept, twitter → x, myspace dropped.
  assert.deepEqual(socialLinks.map((l) => l.platform), ["instagram", "x"]);
});

test("[A8] footer with no columns/social yields NO freeform children", () => {
  const children = buildShellFooterFreeformChildren("fid", {
    brand: { label: "Just brand", tagline: "Just tagline" },
  });
  assert.equal(children.length, 0);
});

// ── full enriched backfill tree ──────────────────────────────────────────────────

// Real-shaped UUIDs (the section node schema requires a UUID sectionId).
const HEADER_SECTION_ID = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const FOOTER_SECTION_ID = "b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2";

function headerSlot(): LegacySnapshotSlot {
  return {
    slotKey: "header",
    sortOrder: 0,
    sectionId: HEADER_SECTION_ID,
    sectionTypeKey: "site_header",
    name: "site header",
    props: FAKE_HEADER_PROPS,
  };
}
function footerSlot(): LegacySnapshotSlot {
  return {
    slotKey: "footer",
    sortOrder: 0,
    sectionId: FOOTER_SECTION_ID,
    sectionTypeKey: "site_footer",
    name: "site footer",
    props: FAKE_FOOTER_PROPS,
  };
}

test("[A8] enrichShellBuilderTree appends nav/social to the landmarks AND preserves the base role-bound children", () => {
  const base = buildLegacySectionBuilderTree([headerSlot(), footerSlot()]);
  const enriched = enrichShellBuilderTree(base, {
    header: FAKE_HEADER_PROPS,
    footer: FAKE_FOOTER_PROPS,
  });
  assert.equal(enriched.length, 2);

  const headerNode = enriched.find(
    (n) => n.kind === "section" && n.props.sectionTypeKey === "site_header",
  );
  const footerNode = enriched.find(
    (n) => n.kind === "section" && n.props.sectionTypeKey === "site_footer",
  );
  assert.ok(headerNode && "children" in headerNode && headerNode.children);
  assert.ok(footerNode && "children" in footerNode && footerNode.children);

  const headerChildren = (headerNode as { children: BuilderNode[] }).children;
  const footerChildren = (footerNode as { children: BuilderNode[] }).children;

  // Base role-bound children preserved (brand heading + primary CTA / tagline).
  assert.ok(
    headerChildren.some((c) => c.id.endsWith(":heading:headline")),
    "header keeps the role-bound brand heading",
  );
  assert.ok(
    headerChildren.some((c) => c.id.endsWith(":button:primaryCta")),
    "header keeps the role-bound CTA",
  );
  // Enriched freeform children appended.
  assert.ok(headerChildren.some((c) => c.kind === "nav"), "header has nav");
  assert.ok(headerChildren.some((c) => c.kind === "image"), "header has logo image");

  assert.ok(
    footerChildren.some((c) => c.id.endsWith(":heading:headline")),
    "footer keeps the role-bound brand heading",
  );
  assert.ok(
    footerChildren.some((c) => c.id.endsWith(":paragraph:copy")),
    "footer keeps the role-bound tagline",
  );
  assert.ok(footerChildren.some((c) => c.kind === "social_links"), "footer has social_links");
  assert.ok(footerChildren.some((c) => c.kind === "nav"), "footer has nav");

  // The enriched tree must validate — the backfill bakes it into the snapshot
  // and the shell surface validates it on load.
  const validated = validateBuilderNodeTree(enriched);
  assert.equal(validated.ok, true, "enriched shell tree must pass validateBuilderNodeTree");
});

test("[A8] enrichShellBuilderTree leaves non-landmark nodes untouched", () => {
  const base: BuilderNode[] = [
    { id: "x", kind: "heading", props: { text: "x", level: 1 } } as BuilderNode,
  ];
  const out = enrichShellBuilderTree(base, { header: FAKE_HEADER_PROPS });
  assert.deepEqual(out, base);
});
