import assert from "node:assert/strict";
import { test } from "node:test";

import type { BuilderNodeTree } from "@/lib/site-admin/builder-node";
import { resolveBuilderNodeGhost, resolveBuilderNodeLocalizedSeed } from "./inline-locale-seed";

const tree = [
  { id: "h1", kind: "heading", props: { text: "Hola" }, i18n: { fr: { text: "Salut" } } },
] as unknown as BuilderNodeTree;

test("primary locale seeds the base prop, no ghost", () => {
  assert.equal(resolveBuilderNodeLocalizedSeed(tree, "h1", "text", "es", "es"), "Hola");
  assert.equal(resolveBuilderNodeGhost(tree, "h1", "text", "es", "es"), null);
});

test("untranslated secondary seeds EMPTY and ghosts the primary (never saves Spanish as English)", () => {
  assert.equal(resolveBuilderNodeLocalizedSeed(tree, "h1", "text", "en", "es"), "");
  assert.equal(resolveBuilderNodeGhost(tree, "h1", "text", "en", "es"), "Hola");
});

test("translated secondary seeds its overlay, no ghost", () => {
  assert.equal(resolveBuilderNodeLocalizedSeed(tree, "h1", "text", "fr", "es"), "Salut");
  assert.equal(resolveBuilderNodeGhost(tree, "h1", "text", "fr", "es"), null);
});

test("TUL-52 P4: an i18n[default] entry shadows the base for the seed and the ghost", () => {
  const seeded = [
    {
      id: "h1",
      kind: "heading",
      props: { text: "The detail is my craft." },
      i18n: { es: { text: "El detalle es mi oficio." } },
    },
  ] as unknown as BuilderNodeTree;
  assert.equal(resolveBuilderNodeLocalizedSeed(seeded, "h1", "text", "es", "es"), "El detalle es mi oficio.");
  assert.equal(resolveBuilderNodeGhost(seeded, "h1", "text", "fr", "es"), "El detalle es mi oficio.");
});

test("missing node stays null (caller falls back to DOM text)", () => {
  assert.equal(resolveBuilderNodeLocalizedSeed(tree, "nope", "text", "en", "es"), null);
  assert.equal(resolveBuilderNodeGhost(tree, "nope", "text", "en", "es"), null);
});
