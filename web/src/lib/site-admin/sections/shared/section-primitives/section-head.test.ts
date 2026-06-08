import assert from "node:assert/strict";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SectionHead } from "./index";

test("SectionHead renders stable h2 markup without client-only branches", () => {
  const html = renderToStaticMarkup(
    React.createElement(SectionHead, {
      headline: "Welcome",
      eyebrow: "Studio",
    }),
  );
  assert.match(html, /<h2[^>]*class="site-prim-head__headline"/);
  assert.match(html, />Welcome</);
  assert.match(html, />Studio</);
});

test("SectionHead returns null when all fields empty", () => {
  const html = renderToStaticMarkup(React.createElement(SectionHead, {}));
  assert.equal(html, "");
});
