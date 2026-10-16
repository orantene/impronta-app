/**
 * Shared `statement_footer`: editorial statement + optional credit / contact.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import {
  STATEMENT_FOOTER_CSS,
  creditLineLooksLikeHost,
  resolveMagazineCreditLine,
} from "./statement-footer-block";
import { renderBuilderNodes } from "./render";
import type { BuilderNode, BuilderStatementFooterNode } from "./types";

function render(nodes: BuilderNode[], publicHost?: string): string {
  return renderToStaticMarkup(
    renderBuilderNodes(nodes, {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      dataSources: {},
      publicHost,
    }),
  );
}

test("statement_footer CSS uses token vars only (no hex)", () => {
  assert.doesNotMatch(STATEMENT_FOOTER_CSS, /#[0-9a-fA-F]{3,8}/);
});

test("statement_footer renders statement, credit, and contact", () => {
  const node = createBuilderNode("statement_footer") as BuilderStatementFooterNode;
  Object.assign(node.props, {
    statement: "Available for editorial and campaign work.",
    creditLine: "Lucía Herrera",
    contactLine: "Inquire for bookings",
    align: "center",
    showRule: true,
  });
  const html = render([node]);
  assert.match(html, /data-builder-kind="statement_footer"/);
  assert.match(html, /data-sf-align="center"/);
  assert.match(html, /Available for editorial and campaign work\./);
  assert.match(html, /Lucía Herrera/);
  assert.match(html, /Inquire for bookings/);
  assert.match(html, /sb-statement-footer-rule/);
  assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}/);
  assert.doesNotMatch(html, /\u2014/);
});

test("statement_footer hides rule and empty optional lines", () => {
  const node = createBuilderNode("statement_footer") as BuilderStatementFooterNode;
  Object.assign(node.props, {
    statement: "Just the line.",
    creditLine: "  ",
    contactLine: "",
    showRule: false,
    align: "start",
  });
  const html = render([node]);
  assert.match(html, /data-sf-align="start"/);
  assert.match(html, /Just the line\./);
  assert.doesNotMatch(html, /class="sb-statement-footer-rule"/);
  assert.doesNotMatch(html, /class="sb-statement-footer-credit"/);
  assert.doesNotMatch(html, /class="sb-statement-footer-contact"/);
});

test("statement_footer returns empty when all fields blank", () => {
  const node = createBuilderNode("statement_footer") as BuilderStatementFooterNode;
  Object.assign(node.props, {
    statement: "   ",
    creditLine: "",
    contactLine: "",
  });
  const html = render([node]);
  assert.equal(html, "");
});

test("magazine credit prefers request host over baked domain mockup", () => {
  assert.equal(creditLineLooksLikeHost("mateoferrer.tulala.digital"), true);
  assert.equal(creditLineLooksLikeHost("Lucía Herrera"), false);
  assert.equal(
    resolveMagazineCreditLine("mateoferrer.tulala.digital", "mateo-ferrer-demo.tulala.digital"),
    "mateo-ferrer-demo.tulala.digital",
  );
  assert.equal(
    resolveMagazineCreditLine("Studio credit", "mateo-ferrer-demo.tulala.digital"),
    "Studio credit",
  );

  const node = createBuilderNode("statement_footer") as BuilderStatementFooterNode;
  Object.assign(node.props, {
    edition: "magazine",
    statement: "Next issue.",
    creditLine: "mateoferrer.tulala.digital",
    contactLine: "For editorials.",
  });
  const html = render([node], "mateo-ferrer-demo.tulala.digital");
  assert.match(html, /mateo-ferrer-demo\.tulala\.digital/);
  assert.doesNotMatch(html, /mateoferrer\.tulala\.digital/);
});
