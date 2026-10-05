import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

// AUD-042: at desktop width the services menu stretched edge to edge with
// price + CTA stranded mid-left. Content is centered at the builder container
// width and list rows pin price/CTA to the right edge.
const src = readFileSync(path.join(__dirname, "render.tsx"), "utf8");
const css = src.slice(src.indexOf("const SERVICES_CATALOG_CSS"));

test("AUD-042: catalog content is centered at the container max-width", () => {
  const container = src.match(/\.site-builder-node--container\{[^}]*max-width:(\d+px)/);
  assert.ok(container, "container max-width rule missing");
  assert.ok(
    css.includes(
      `.site-builder-node--services-catalog>:not(style){max-width:${container[1]};margin-inline:auto}`,
    ),
    "services catalog children must share the container max-width and center",
  );
});

test("AUD-042: desktop list rows pin price + CTA right", () => {
  const block = css.slice(css.indexOf("@media (min-width:768px){"));
  assert.match(block, /data-has-photo="true"\]\{grid-template-columns:92px minmax\(0,1fr\) auto\}/);
  assert.match(block, /services-catalog-buy\{justify-self:end\}/);
  assert.match(block, /services-catalog-copy\{max-width:none\}/);
});

test("AUD-042 follow-up: .cb-island (rows live path) is capped and centred", () => {
  assert.match(
    css,
    /\.site-builder-node--services-catalog\.site-builder-node--services-catalog>\.cb-island,[\s\S]*?\{box-sizing:border-box;width:100%;max-width:1120px;margin-inline:auto\}/,
  );
});

test("AUD-042 follow-up: rows layout through .cb-island is a right-pinned grid", () => {
  const block = css.slice(css.lastIndexOf("@media (min-width:768px){"));
  assert.match(
    block,
    /\[data-layout="rows"\] \.cb-island \.site-builder-node--services-catalog-list>\.site-builder-node--services-catalog-row\[data-has-photo="true"\],[\s\S]*?\{grid-template-columns:92px minmax\(0,1fr\) auto\}/,
  );
  assert.match(block, /\[data-layout="rows"\] \.cb-island [^{]*services-catalog-buy,[\s\S]*?\{justify-self:end;width:auto;flex:none\}/);
  for (const f of ["services-catalog-filter.tsx", "services-catalog-static-fallback.tsx"]) {
    const tsx = readFileSync(path.join(__dirname, f), "utf8");
    assert.ok(tsx.includes('className="cb-island"'), `${f} must render the .cb-island wrapper`);
    assert.ok(tsx.includes('className="site-builder-node--services-catalog-list"'), `${f} list class`);
  }
});

test("AUD-042: phone layout from AUD-026 untouched", () => {
  assert.ok(css.includes("@media (max-width:560px){"));
  assert.ok(css.includes("[data-cms-block]>.site-builder-node--services-catalog{padding-inline:1.5rem}"));
});
