/**
 * A theme release can add `i18n.<defaultLocale>` to a block whose base text the
 * talent already edited. Her base text must still win for the default locale;
 * the overlay only supplies the OTHER locales.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveNodeProp } from "@/lib/i18n/builder-i18n";

import { localizeBlockNode } from "./block-i18n";
import { createBuilderNode } from "./create";
import type { BuilderNode } from "./types";

function button(label: string, i18n: Record<string, Record<string, string>>): BuilderNode {
  const base = createBuilderNode("button");
  return { ...base, id: "b1", props: { ...base.props, label, i18n } } as unknown as BuilderNode;
}

test("default-locale overlay does not replace the edited base label", () => {
  const n = button("Book with Rosa", { en: { label: "See services" }, es: { label: "Ver servicios" } });
  const en = localizeBlockNode(n, { locale: "en", defaultLocale: "en", chain: ["en"] });
  assert.equal((en.props as { label: string }).label, "Book with Rosa");
  const es = localizeBlockNode(n, { locale: "es", defaultLocale: "en", chain: ["en"] });
  assert.equal((es.props as { label: string }).label, "Ver servicios");
});

test("resolveNodeProp: base wins for the default locale, overlay serves others", () => {
  const n = { label: "Escríbeme ya", i18n: { es: { label: "Escríbeme" }, en: { label: "Write me" } } };
  assert.equal(resolveNodeProp(n, "label", "es", "es", ["es"]).value, "Escríbeme ya");
  assert.equal(resolveNodeProp(n, "label", "en", "es", ["es"]).value, "Write me");
});

test("empty base still falls back to the default-locale overlay", () => {
  const n = { label: "", i18n: { en: { label: "See services" } } };
  assert.equal(resolveNodeProp(n, "label", "en", "en", ["en"]).value, "See services");
});
