/**
 * Ticket #209: the header's nav and CTA labels (kept in `sectionProps`) can
 * hold a translation through `sectionProps.*` overlay keys.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNode } from "@/lib/site-admin/builder-node";
import { COLLECTION_DESIGNS } from "./theme-catalog/collection/designs";
import { headerLabelEntries, headerSectionProps } from "./header-i18n";

const SECTION_PROPS = {
  navItems: [
    { label: "Work", href: "#gallery" },
    { label: "About", href: "#about" },
  ],
  primaryCta: { label: "Inquire", href: "/contact" },
  regions: { right: [{ type: "language" }, { type: "cta", label: "Inquire", href: "/contact" }] },
};

function header(i18n?: Record<string, Record<string, string>>): BuilderNode {
  return {
    id: "h1",
    kind: "section",
    props: { sectionTypeKey: "site_header", slotKey: "header", sectionProps: SECTION_PROPS, ...(i18n ? { i18n } : {}) },
    ...(i18n ? { i18n } : {}),
  } as unknown as BuilderNode;
}

test("no overlay returns the stored sectionProps object untouched", () => {
  assert.equal(headerSectionProps(header(), "es"), SECTION_PROPS);
});

test("an overlay for another language returns the stored object untouched", () => {
  const node = header({ en: { "sectionProps.navItems.0.label": "Work" } });
  assert.equal(headerSectionProps(node, "es"), SECTION_PROPS);
});

test("a Spanish overlay rewrites nav labels and both CTA spots, leaving hrefs alone", () => {
  const node = header({
    es: {
      "sectionProps.navItems.0.label": "Trabajos",
      "sectionProps.primaryCta.label": "Escríbeme",
      "sectionProps.regions.right.1.label": "Escríbeme",
    },
  });
  const out = headerSectionProps(node, "es-MX") as typeof SECTION_PROPS;
  assert.equal(out.navItems[0]?.label, "Trabajos");
  assert.equal(out.navItems[0]?.href, "#gallery");
  assert.equal(out.navItems[1]?.label, "About");
  assert.equal(out.primaryCta.label, "Escríbeme");
  assert.equal((out.regions.right[1] as { label: string }).label, "Escríbeme");
  // The stored object is not mutated.
  assert.equal(SECTION_PROPS.navItems[0]?.label, "Work");
});

test("a stale path is skipped, never created", () => {
  const node = header({ es: { "sectionProps.navItems.9.label": "Fantasma", "sectionProps.nope.label": "x" } });
  assert.deepEqual(headerSectionProps(node, "es"), SECTION_PROPS);
});

test("props.i18n alone (no node.i18n mirror) is honoured", () => {
  const node = {
    id: "h2",
    kind: "section",
    props: { sectionProps: SECTION_PROPS, i18n: { es: { "sectionProps.navItems.1.label": "Sobre mí" } } },
  };
  const out = headerSectionProps(node, "es") as typeof SECTION_PROPS;
  assert.equal(out.navItems[1]?.label, "Sobre mí");
});

test("headerLabelEntries lists nav, primary CTA and region CTAs", () => {
  assert.deepEqual(
    headerLabelEntries(SECTION_PROPS).map((e) => e.key),
    ["navItems.0.label", "navItems.1.label", "primaryCta.label", "regions.right.1.label"],
  );
});

test("the Folio header seed reads Spanish and English from its overlay", () => {
  const folio = COLLECTION_DESIGNS.find((d) => d.slug === "folio");
  assert.ok(folio, "folio design missing");
  const shell = folio.buildPayload().shellTree.find(
    (n) => n.kind === "section" && (n.props as { sectionTypeKey?: string }).sectionTypeKey === "site_header",
  );
  assert.ok(shell, "folio seeds no site_header");
  type Labelled = { navItems: Array<{ label: string }>; primaryCta: { label: string } };
  // TUL-369: overlays alone — no Inquire→Escríbeme guess map.
  // Folio CTA English base ("Ask about this") lands via #2914, not designs.ts.
  const es = headerSectionProps(shell, "es") as Labelled;
  const en = headerSectionProps(shell, "en") as Labelled;
  assert.deepEqual(es.navItems.map((i) => i.label), ["Trabajos elegidos", "Más trabajos", "Contratación"]);
  assert.equal(es.primaryCta.label, "Consultar");
  assert.deepEqual(en.navItems.map((i) => i.label), ["Selected work", "More work", "Rates"]);
  assert.equal(en.primaryCta.label, "Consultar");
});
