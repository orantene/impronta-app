/**
 * OnbDev-folio-scroll (TUL-532) — marquee track + magazine contact CTA must
 * not widen a 390 phone viewport.
 *
 * Run: npm run test:wt -- src/lib/site-admin/builder-node/folio-scroll-containment.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BUILDER_NODE_RENDERER_CSS } from "./render";
import { STATEMENT_FOOTER_MAGAZINE_CSS } from "./statement-footer-block";

describe("OnbDev-folio-scroll containment", () => {
  it("marquee clips the max-content track on the X axis", () => {
    assert.match(
      BUILDER_NODE_RENDERER_CSS,
      /\.site-builder-node--marquee\{[^}]*max-width:100%[^}]*min-width:0[^}]*overflow-x:clip/,
    );
    assert.match(
      BUILDER_NODE_RENDERER_CSS,
      /\.site-builder-node--marquee-track\{[^}]*width:max-content/,
    );
  });

  it("magazine statement footer keeps the contact CTA inside the band", () => {
    assert.match(
      STATEMENT_FOOTER_MAGAZINE_CSS,
      /\.sb-statement-footer\[data-edition="magazine"\]\{[^}]*overflow-x:clip/,
    );
    assert.match(
      STATEMENT_FOOTER_MAGAZINE_CSS,
      /\.sb-statement-footer\[data-edition="magazine"\] \.sb-mag-btn\{max-width:100%/,
    );
    assert.match(
      STATEMENT_FOOTER_MAGAZINE_CSS,
      /\.sb-statement-footer\[data-edition="magazine"\] \.sb-mag-fine\{[^}]*flex-wrap:wrap/,
    );
  });
});
