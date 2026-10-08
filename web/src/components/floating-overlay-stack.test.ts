import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { CATALOG_OVERLAY_CSS, FLOATING_OVERLAY_STACK_CSS } from "./floating-overlay-stack-css";

const here = dirname(fileURLToPath(import.meta.url));

test("consent-first: language suggestion hides while cookie banner is up (DS-63)", () => {
  assert.match(
    FLOATING_OVERLAY_STACK_CSS,
    /body:has\(\[data-consent-banner\]\) \[data-locale-suggestion\]\{display:none\}/,
  );
});

test("neither banner paints over an aria-modal dialog", () => {
  assert.match(
    FLOATING_OVERLAY_STACK_CSS,
    /body:has\(\[role="dialog"\]\[aria-modal="true"\]\) \[data-consent-banner\]/,
  );
  assert.match(
    FLOATING_OVERLAY_STACK_CSS,
    /body:has\(\[role="dialog"\]\[aria-modal="true"\]\) \[data-locale-suggestion\]/,
  );
});

test("sticky booking chrome hides both banners", () => {
  assert.match(
    FLOATING_OVERLAY_STACK_CSS,
    /body:has\(\.cb-dock\[data-show="true"\]\) \[data-consent-banner\]/,
  );
  assert.match(
    FLOATING_OVERLAY_STACK_CSS,
    /body:has\(\.cb-bar\[data-show="true"\]\) \[data-locale-suggestion\]/,
  );
});

test("language strip clears the dashboard mobile bottom nav", () => {
  assert.match(
    FLOATING_OVERLAY_STACK_CSS,
    /body:has\(\[data-tulala-mobile-bottom-nav\]\) \[data-locale-suggestion\]/,
  );
});

test("catalog overlay CSS still carries consent-first + dock gap (compat)", () => {
  assert.match(CATALOG_OVERLAY_CSS, /body:has\(\[data-consent-banner\]\) \[data-locale-suggestion\]/);
  assert.match(CATALOG_OVERLAY_CSS, /\.cb-dock\{gap:16px\}/);
});

test("root layout mounts FloatingOverlayStackStyles (global, not catalog-only)", () => {
  const layout = readFileSync(join(here, "../app/layout.tsx"), "utf8");
  assert.match(layout, /FloatingOverlayStackStyles/);
  assert.match(layout, /floating-overlay-stack/);
});

test("catalog idle-bar re-exports shared CATALOG_OVERLAY_CSS", () => {
  const idle = readFileSync(
    join(here, "../lib/site-admin/builder-node/services-catalog-idle-bar.tsx"),
    "utf8",
  );
  assert.match(idle, /from "@\/components\/floating-overlay-stack-css"/);
  assert.doesNotMatch(idle, /export const CATALOG_OVERLAY_CSS = /);
});
