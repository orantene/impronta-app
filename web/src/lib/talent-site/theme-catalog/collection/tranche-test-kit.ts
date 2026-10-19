/**
 * Shared checks for the tranche themes' golden tests (Table, Ribbon, Clarity,
 * Mosaic, Prism): what every released-quality talent design must hold, so each
 * theme's own test file only pins what it read off its screenshot.
 */
import assert from "node:assert/strict";

import { FINISHED_GALLERY_SLUGS, getGalleryDesign } from "../gallery-meta";
import { designTokenDefaults } from "./design-token-defaults";
import { COLLECTION_DESIGNS, COLLECTION_DESIGN_GAPS } from "./designs";

export type N = { kind?: string; props?: Record<string, unknown>; children?: N[] };

export function find(nodes: N[], pred: (n: N) => boolean): N | null {
  for (const n of nodes) {
    if (pred(n)) return n;
    const hit = find(n.children ?? [], pred);
    if (hit) return hit;
  }
  return null;
}

export function payloadOf(slug: string) {
  return COLLECTION_DESIGNS.find((d) => d.slug === slug)!.buildPayload();
}

/** Draft registration, services band, no hex, tokens, ES overlay for every {i} heading. */
export function assertDraftTheme(
  slug: string,
  palette: { page: string; accent: string },
  tokens: Readonly<Record<string, string>>,
  headingFont: string,
) {
  assert.ok(COLLECTION_DESIGNS.some((d) => d.slug === slug), "registered in the collection");
  assert.equal((FINISHED_GALLERY_SLUGS as readonly string[]).includes(slug), false, "DRAFT: not in the finished gallery");
  assert.deepEqual(COLLECTION_DESIGN_GAPS[slug], [], "no open widget gaps");
  const p = payloadOf(slug);
  const home = p.homeTree as unknown as N[];
  const json = JSON.stringify(home);
  assert.match(json, /"slotKey":"services"|"sectionTypeKey":"services"/, "services band stays");
  assert.match(json, /"slotKey":"contact"|"sectionTypeKey":"contact"/, "contact band stays");
  assert.doesNotMatch(json, /#[0-9a-fA-F]{6}\b/, "no literal hex in the home tree");
  const d = designTokenDefaults(slug);
  for (const [k, v] of Object.entries(tokens)) {
    assert.equal(d[k], v, `registered token default ${k}`);
    assert.equal(p.tokenDefaults?.[k] !== undefined ? p.tokenDefaults[k] : v, v, `payload token default ${k}`);
  }
  const g = getGalleryDesign(slug)!;
  assert.equal(g.fonts?.heading, headingFont);
  assert.equal(g.palettes[0]!.page.toUpperCase(), palette.page);
  assert.equal(g.palettes[0]!.accent.toUpperCase(), palette.accent);
  assert.ok(g.demos.every((x) => x.status === "planned"), "no demo is assigned or built");
}

/** Every seeded text node that carries an {i} marker ships a Spanish overlay with the marker kept. */
export function assertItalicMarkersSeeded(slug: string) {
  const bad: string[] = [];
  const walk = (nodes: N[]) => {
    for (const n of nodes) {
      const text = (n.props?.title ?? n.props?.text) as string | undefined;
      if (typeof text === "string" && text.includes("{i}")) {
        const es = (n.props?.i18n as { es?: Record<string, string> } | undefined)?.es;
        const key = n.props?.title !== undefined ? "title" : "text";
        if (!es?.[key] || !es[key]!.includes("{i}")) bad.push(text);
      }
      walk(n.children ?? []);
    }
  };
  walk(payloadOf(slug).homeTree as unknown as N[]);
  assert.deepEqual(bad, [], "every italic heading has its Spanish overlay");
}
