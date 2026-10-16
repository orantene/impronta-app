/**
 * PM 5:35 D · TUL-121 Gridline QA minors (TUL-474 + TUL-496 layout leftovers).
 * Theme-core CSS / kit padding only — no per-talent seed, no shared booking files.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { AREA_CSS } from "./area-block";
import { PORTFOLIO_WORK_ORDER_CSS } from "./portfolio-work-order";
import { SERVICES_MATRIX_CSS } from "./services-catalog-matrix";
import { UTILITY_BAR_CSS } from "./utility-bar-block";

test("TUL-474 utility bar: subtitle wraps, CTA on phone, no stray pill-only dot", () => {
  assert.match(UTILITY_BAR_CSS, /-webkit-line-clamp:2/);
  assert.match(UTILITY_BAR_CSS, /overflow-wrap:anywhere/);
  assert.match(UTILITY_BAR_CSS, /\.sb-ub-cta\{display:inline-flex/);
  assert.doesNotMatch(UTILITY_BAR_CSS, /\.sb-ub-cta\{display:none/);
  assert.doesNotMatch(UTILITY_BAR_CSS, /\.sb-ub-pill span\{display:none\}/);
  assert.match(UTILITY_BAR_CSS, /@container sbub \(max-width:330px\)\{\.sb-ub-pill\{display:none\}/);
  assert.doesNotMatch(UTILITY_BAR_CSS, /\u2014|\u2013/);
});

test("TUL-496 matrix: fixed table fills band, wraps cells, no forced horizontal scroll", () => {
  assert.match(SERVICES_MATRIX_CSS, /table-layout:fixed/);
  assert.match(SERVICES_MATRIX_CSS, /overflow-wrap:anywhere/);
  assert.match(SERVICES_MATRIX_CSS, /\.sb-mx-scroll\{display:none;overflow-x:clip/);
  assert.doesNotMatch(SERVICES_MATRIX_CSS, /\.sb-mx-scroll\{display:none;overflow-x:auto/);
  assert.doesNotMatch(SERVICES_MATRIX_CSS, /width:140px/);
});

test("TUL-474/496 work_order + area: phone chrome clearance and area air gap", () => {
  assert.match(PORTFOLIO_WORK_ORDER_CSS, /padding-bottom:max\(28px,calc\(96px \+ env\(safe-area-inset-bottom/);
  assert.match(PORTFOLIO_WORK_ORDER_CSS, /scroll-margin-bottom:96px/);
  assert.match(AREA_CSS, /scroll-margin-top:72px/);
  assert.match(AREA_CSS, /\.sb-area-header\{margin:12px 0/);
});

test("TUL-496 proof/area kit bands ship side gutter (not flush)", async () => {
  const { proofBlock, areaBlock } = await import(
    "@/lib/talent-site/theme-catalog/section-kit-proof"
  );
  const id = (() => {
    let n = 0;
    return () => `g${++n}`;
  })();
  const proof = proofBlock(id);
  const area = areaBlock(id);
  const proofStyle = (proof.props as { style?: { paddingX?: string; paddingY?: string } }).style;
  const areaStyle = (area.props as { style?: { paddingX?: string; paddingY?: string } }).style;
  assert.equal(proofStyle?.paddingX, "m");
  assert.equal(proofStyle?.paddingY, "m");
  assert.equal(areaStyle?.paddingX, "m");
  assert.equal(areaStyle?.paddingY, "m");
});
