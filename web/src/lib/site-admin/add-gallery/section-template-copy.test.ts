import assert from "node:assert/strict";
import { test } from "node:test";

import { buildAddGallerySectionTemplate } from "./section-templates";
import { localizeSectionTemplate } from "./section-template-copy";

const json = (n: unknown) => JSON.stringify(n);

test("talent + es: About simple has no agency copy", () => {
  const node = buildAddGallerySectionTemplate("about");
  assert.ok(node);
  const out = json(localizeSectionTemplate(node, { siteKind: "talent", locale: "es" }));
  assert.ok(!/Our agency|your agency|About us/.test(out));
  assert.ok(out.includes("Sobre mí"));
});
test("talent + en: no agency wording", () => {
  const out = json(localizeSectionTemplate(buildAddGallerySectionTemplate("about")!, { siteKind: "talent", locale: "en" }));
  assert.ok(!/agency/i.test(out));
});
test("agency + en is untouched", () => {
  const node = buildAddGallerySectionTemplate("about")!;
  assert.equal(localizeSectionTemplate(node, { siteKind: "agency", locale: "en" }), node);
});
test("agency + es translates", () => {
  const out = json(localizeSectionTemplate(buildAddGallerySectionTemplate("about")!, { siteKind: "agency", locale: "es" }));
  assert.ok(out.includes("Nuestra agencia"));
});
test("ids and kinds are preserved", () => {
  const node = buildAddGallerySectionTemplate("about")!;
  const out = localizeSectionTemplate(node, { siteKind: "talent", locale: "es" });
  assert.equal(out.id, node.id);
  assert.equal(out.kind, node.kind);
});
