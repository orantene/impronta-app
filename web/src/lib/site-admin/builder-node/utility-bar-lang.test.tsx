/**
 * GRK-030: bilingual utility_bar headers paint a sticky ES / EN switch.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import type { BuilderUtilityBarNode } from "./types";
import { renderUtilityBarBlock, UTILITY_BAR_CSS } from "./utility-bar-block";

function bar(): BuilderUtilityBarNode {
  return createBuilderNode("utility_bar") as BuilderUtilityBarNode;
}

test("utility bar CSS keeps the language switch on phone widths", () => {
  assert.match(UTILITY_BAR_CSS, /\.sb-ub-lang\{/);
  assert.doesNotMatch(UTILITY_BAR_CSS, /@container sbub \(max-width:330px\)\{[^}]*\.sb-ub-lang/);
});

test("utility bar paints ES / EN when siteLocales has 2+ codes", () => {
  const html = renderToStaticMarkup(
    renderUtilityBarBlock({
      node: bar(),
      siteLocales: {
        locales: ["es", "en"],
        hrefs: { es: "/?locale=es", en: "/en" },
        current: "es",
      },
    }),
  );
  assert.match(html, /data-ub-lang=""/);
  assert.match(html, /aria-label="Idioma"/);
  assert.match(html, /href="\/\?locale=es"[^>]*aria-current="true"/);
  assert.match(html, /href="\/en"/);
  assert.match(html, />ES</);
  assert.match(html, />EN</);
});

test("utility bar hides language when the site has one locale", () => {
  const html = renderToStaticMarkup(
    renderUtilityBarBlock({
      node: bar(),
      siteLocales: { locales: ["es"], hrefs: { es: "/" }, current: "es" },
    }),
  );
  assert.equal(html.includes("data-ub-lang"), false);
});
