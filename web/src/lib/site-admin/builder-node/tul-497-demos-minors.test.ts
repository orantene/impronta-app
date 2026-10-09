/**
 * TUL-497 / TUL-121 — Frame + Solace demo minors (diego / valeria / tomas).
 * Theme core only: cards stay one column on phone/tablet, CTAs wrap, filter
 * bar nav meets contrast, portfolio reserves height, Solace eyebrow is trade copy.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { localiseSeededDesignLabel } from "@/lib/talent-site/design-label-locale";
import { buildFramePayload, buildSolacePayload } from "@/lib/talent-site/theme-catalog/collection/designs";
import { PORTFOLIO_CSS } from "./portfolio-block";

const RENDER_CSS = readFileSync(join(__dirname, "render.tsx"), "utf8");
const NAV_CSS = readFileSync(join(__dirname, "nav-css.ts"), "utf8");

function walk(nodes: readonly unknown[], visit: (n: Record<string, unknown>) => void) {
  for (const raw of nodes) {
    if (!raw || typeof raw !== "object") continue;
    const n = raw as Record<string, unknown>;
    visit(n);
    const children = n.children;
    if (Array.isArray(children)) walk(children, visit);
  }
}

test("cards/grid/editorial catalogs collapse to 1 column through 899px (no 2-up Soli clip)", () => {
  assert.match(
    RENDER_CSS,
    /@media \(max-width:899px\)\{\s*\.site-builder-node--services-catalog\[data-layout="cards"\][\s\S]*?grid-template-columns:1fr/,
  );
  assert.match(
    RENDER_CSS,
    /data-layout="cards"\] \.site-builder-node--services-catalog-cta[\s\S]*?white-space:normal/,
  );
  assert.match(
    RENDER_CSS,
    /data-layout="cards"\] \.site-builder-node--services-catalog-row[\s\S]*?overflow:visible/,
  );
});

test("filter_bar nav links use ink (readable ≥ muted chips)", () => {
  assert.match(
    NAV_CSS,
    /data-nav-chrome="filter_bar"\] \.site-builder-node--nav-links>li>a\{[^}]*color:var\(--token-color-ink/,
  );
  assert.match(
    NAV_CSS,
    /data-nav-chrome="filter_bar"\] \.site-builder-node--nav-links>li>a\{[^}]*border:1px solid color-mix\(in srgb,var\(--token-color-ink/,
  );
});

test("portfolio grid/contact_sheet reserve height before images load", () => {
  assert.match(PORTFOLIO_CSS, /\.sb-portfolio--grid,\.sb-portfolio--contact_sheet\{min-height:/);
  assert.match(PORTFOLIO_CSS, /\.sb-portfolio-empty\{[^}]*min-height:12rem/);
});

test("Solace cover eyebrow is Dance instructor (ES: Instructora de baile), not taxonomy Bailarín", () => {
  const payload = buildSolacePayload();
  const texts: string[] = [];
  walk(payload.homeTree as unknown[], (n) => {
    const props = (n.props ?? {}) as Record<string, unknown>;
    if (typeof props.text === "string") texts.push(props.text);
  });
  assert.ok(texts.includes("Dance instructor"), `eyebrow missing; got ${texts.slice(0, 8).join(" | ")}`);
  assert.ok(!texts.includes("{{primaryTypeLabel}}"), "Solace must not bind masculine taxonomy primaryTypeLabel");
  assert.equal(localiseSeededDesignLabel("Dance instructor", "es"), "Instructora de baile");
  assert.equal(localiseSeededDesignLabel("Dance instructor", "en"), "Dance instructor");
});

test("Frame hero headshot prefers face (objectPosition center 18%)", () => {
  const payload = buildFramePayload();
  let found = false;
  walk(payload.homeTree as unknown[], (n) => {
    if (n.kind !== "image") return;
    const props = (n.props ?? {}) as Record<string, unknown>;
    if (props.src !== "{{headshotUrl}}") return;
    const style = (props.style ?? {}) as Record<string, unknown>;
    assert.equal(style.objectPosition, "center 18%");
    found = true;
  });
  assert.ok(found, "Frame hero headshot image missing");
});
