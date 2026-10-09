/**
 * Mode-aware CTA remaps (TUL-369). Guess maps in design-label-locale.ts are
 * FALLBACK only when a node has no i18n.es (PM split until heal recount=0).
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { localiseSeededDesignLabels, localiseSeededDesignLabel, localiseOne } from "./design-cta-mode";
import { SEED_TEXT_ES } from "./theme-catalog/seed-i18n";

test("Maison v2 hero primary follows the booking mode (EN + ES)", () => {
  const one = [
    { id: "b", kind: "button", props: { label: "Reserve a time", href: "#services" } },
    { id: "a", kind: "button", props: { label: "Ask", href: "#ask" } },
  ] as unknown as BuilderNode[];
  const label = (t: BuilderNode[], i: number) => (t[i]!.props as { label: string }).label;
  assert.equal(label(localiseSeededDesignLabels(one, "es", "instant"), 0), "Reservar");
  assert.equal(label(localiseSeededDesignLabels(one, "en", "instant"), 0), "Book now");
  assert.equal(label(localiseSeededDesignLabels(one, "es", "request"), 0), "Solicitar cita");
  assert.equal(label(localiseSeededDesignLabels(one, "en", "inquiry"), 0), "Ask for a quote");
  // "Ask" is not mode-dependent; without i18n.es the guess-map FALLBACK applies.
  assert.equal(label(localiseSeededDesignLabels(one, "es", null), 1), SEED_TEXT_ES["Ask"]);
  // With an overlay bag, guess map stays out.
  const withEs = [
    { id: "a", kind: "button", props: { label: "Ask", href: "#ask", i18n: { es: { label: "Pregúntame" } } } },
  ] as unknown as BuilderNode[];
  assert.equal(label(localiseSeededDesignLabels(withEs, "es", null), 0), "Ask");
});

test("Spanish mode-action copy follows the booking mode in English", () => {
  assert.equal(localiseSeededDesignLabel("Solicitar cita", "en", "inquiry"), "Ask for a quote");
  assert.equal(localiseOne("Recent work", "other", null), null);
  assert.equal(localiseOne("Editorial", "en", null), null);
});

test("en: an untouched English tree is returned as is", () => {
  const tree = [
    { id: "h", kind: "heading", props: { text: "Recent work", level: 2 } },
  ] as unknown as BuilderNode[];
  assert.equal(localiseSeededDesignLabels(tree, "en"), tree);
});

test("talent-edited copy is never rewritten by the mode map", () => {
  const es = [
    { id: "h", kind: "heading", props: { text: "Mi trabajo", level: 2 } },
  ] as unknown as BuilderNode[];
  assert.equal(localiseSeededDesignLabels(es, "es"), es);
  assert.equal(localiseSeededDesignLabels(es, "en"), es);
});
