/**
 * TUL-532 / GRK-048 · 073 · 044 · 076 · 046 · 083 — theme visual QA done-when.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { SERVICES_MATRIX_CSS } from "./services-catalog-matrix";
import { UTILITY_BAR_CSS } from "./utility-bar-block";
import { PORTFOLIO_CSS } from "./portfolio-block";
import { PORTFOLIO_WORK_ORDER_CSS } from "./portfolio-work-order";
import { UTILITY_TYPE_SYSTEM_CSS } from "@/lib/talent-site/theme-catalog/collection/design-type-system-utility";
import { buildGridlinePayload } from "@/lib/talent-site/theme-catalog/collection/gridline";

const renderCss = readFileSync(path.join(__dirname, "render.tsx"), "utf8");
const tokenPresets = readFileSync(
  path.join(__dirname, "../../../app/token-presets.css"),
  "utf8",
);
const proofSeed = readFileSync(
  path.join(__dirname, "../../talent-site/theme-catalog/section-kit-proof.ts"),
  "utf8",
);
const sectionKit = readFileSync(
  path.join(__dirname, "../../talent-site/theme-catalog/section-kit.ts"),
  "utf8",
);
const portfolioSrc = readFileSync(path.join(__dirname, "portfolio-block.tsx"), "utf8");

test("GRK-048: Trades matrix fills the band with no H-scroll", () => {
  assert.match(SERVICES_MATRIX_CSS, /table-layout:fixed/);
  assert.match(SERVICES_MATRIX_CSS, /\.sb-mx-scroll\{[^}]*overflow-x:clip/);
  assert.match(SERVICES_MATRIX_CSS, /overflow-wrap:anywhere/);
  const json = JSON.stringify(buildGridlinePayload());
  assert.match(json, /"layout":"matrix"/);
  assert.match(json, /"contentWidth":"full"/);
  assert.match(json, /"maxWidth":"full"/);
});

test("GRK-048: catalog stretches inside an align:start stack (no one-letter columns)", () => {
  assert.match(
    renderCss,
    /\.site-builder-node--container:not\(\[data-builder-layout="row"\],\[data-builder-layout="grid"\],\[data-builder-display="grid"\]\)>\.site-builder-node--services-catalog\{align-self:stretch;min-width:0\}/,
  );
});

test("GRK-073: phone padding ≥16px on utility chrome + proof bands", () => {
  assert.match(UTILITY_BAR_CSS, /padding:10px 16px/);
  assert.match(UTILITY_TYPE_SYSTEM_CSS, /padding-inline:max\(16px/);
  assert.match(proofSeed, /paddingX: "m"/);
  assert.doesNotMatch(proofSeed, /paddingX: "none"/);
});

test("GRK-044: gallery lightbox button is photo-only (caption outside button)", () => {
  assert.match(portfolioSrc, /captions stay outside the lightbox/);
  // Closing PortfolioShotLink before figcaption.
  assert.match(portfolioSrc, /<\/PortfolioShotLink>\s*\{caption\}/);
});

test("GRK-076: face-forward object-position on portfolio + heroes", () => {
  assert.match(PORTFOLIO_CSS, /object-position:center 18%/);
  assert.match(PORTFOLIO_WORK_ORDER_CSS, /object-position:center 18%/);
  assert.match(sectionKit, /objectPosition: "center 18%"/);
  assert.match(sectionKit, /backgroundPosition: "center 18%"/);
});

test("GRK-046: header brand mark is at least 32px", () => {
  assert.match(
    tokenPresets,
    /\.site-header__brand-mark \{ width: clamp\(32px, 3\.5vw, 44px\); height: clamp\(32px, 3\.5vw, 44px\)/,
  );
});

test("GRK-083: cards/grid/editorial stay 1 column through 899px with wrapping CTAs", () => {
  assert.match(renderCss, /@media \(max-width:899px\)/);
  const phone = renderCss.slice(renderCss.indexOf("@media (max-width:899px){"));
  assert.match(
    phone,
    /services-catalog\[data-layout="cards"\][\s\S]*?grid-template-columns:1fr/,
  );
  assert.match(
    renderCss,
    /data-layout="cards"\] \.site-builder-node--services-catalog-cta[\s\S]*?white-space:normal/,
  );
});
