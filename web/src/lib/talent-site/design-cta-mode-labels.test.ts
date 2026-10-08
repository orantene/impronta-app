/**
 * Mode-aware CTA remaps (TUL-369). The EN↔ES guess map that lived in
 * design-label-locale.ts is deleted; these tests cover only what remains.
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { localiseSeededDesignLabels, localiseSeededDesignLabel, localiseOne } from "./design-cta-mode";

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
  // "Ask" is not mode-dependent and has no guess map — stays English.
  assert.equal(label(localiseSeededDesignLabels(one, "es", null), 1), "Ask");
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
