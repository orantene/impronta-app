import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { StorefrontFilter } from "./StorefrontFilter";

// TUL-684: the pills drew the primary (Spanish) category key on /en.
test("category pills show the visitor-language label, keyed by the primary category", () => {
  const html = renderToStaticMarkup(
    createElement(StorefrontFilter, {
      visible: [],
      locale: "en",
      categories: ["Pestañas", "Novias y eventos", "QA"],
      categoryLabels: { Pestañas: "Lashes", "Novias y eventos": "Bridal and events" },
    }),
  );
  assert.match(html, />Lashes</);
  assert.match(html, />Bridal and events</);
  assert.match(html, />QA</);
  assert.doesNotMatch(html, />Pestañas</);
  assert.doesNotMatch(html, />Novias y eventos</);
});

test("no labels given: pills show the category as written", () => {
  const html = renderToStaticMarkup(
    createElement(StorefrontFilter, { visible: [], locale: "es", categories: ["Pestañas", "QA"] }),
  );
  assert.match(html, />Pestañas</);
});
