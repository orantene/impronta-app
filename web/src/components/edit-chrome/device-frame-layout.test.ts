import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  HERO_SLIDE_PEAK_SCALE,
  MOBILE_EDIT_HUD_RESERVE_PX,
  heroSlideOverflowPx,
  isDeviceEditingHudOpen,
  resolveDeviceFrameHostPadding,
  resolveDeviceFrameHudLeftReserve,
  shouldShowDeviceFrameSkeleton,
} from "./device-frame-layout";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

test("hero slider scale(1.08) explains the ~107px left shift at a 1340px canvas", () => {
  // QA measured ~107px sideways shift on qa-fresh-studio-2. The Ken-Burns
  // peak on `.site-hero__slide` is scale(1.08); 1340 * 0.08 = 107.2.
  assert.equal(HERO_SLIDE_PEAK_SCALE, 1.08);
  assert.equal(heroSlideOverflowPx(1340), 107);
  assert.equal(heroSlideOverflowPx(1280), 102);
  assert.equal(heroSlideOverflowPx(390), 31);
  assert.equal(heroSlideOverflowPx(0), 0);
  assert.equal(heroSlideOverflowPx(1340, 1), 0);
});

test("globals.css pins .site-hero to overflow:clip so the scale cannot scroll", () => {
  const css = readFileSync(join(THIS_DIR, "../../app/globals.css"), "utf8");
  const start = css.indexOf(".site-hero {");
  assert.ok(start >= 0, ".site-hero rule missing");
  const block = css.slice(start, css.indexOf("}", start));
  assert.match(block, /overflow:\s*clip/);
  assert.doesNotMatch(block, /overflow:\s*hidden/);
});

test("device-frame host reserves inspector + Mobile/Tablet HUD gutters", () => {
  assert.equal(isDeviceEditingHudOpen({ device: "tablet", mobileEditMode: false }), true);
  assert.equal(isDeviceEditingHudOpen({ device: "mobile", mobileEditMode: true }), true);
  assert.equal(isDeviceEditingHudOpen({ device: "mobile", mobileEditMode: false }), false);
  assert.equal(isDeviceEditingHudOpen({ device: "desktop", mobileEditMode: false }), false);

  assert.equal(
    resolveDeviceFrameHudLeftReserve({ device: "tablet", mobileEditMode: false }),
    MOBILE_EDIT_HUD_RESERVE_PX,
  );
  assert.equal(
    resolveDeviceFrameHudLeftReserve({ device: "desktop", mobileEditMode: false }),
    0,
  );

  const pad = resolveDeviceFrameHostPadding({
    isPhone: false,
    navigatorOpen: true,
    navigatorWidth: 280,
    inspectorOpen: true,
    device: "tablet",
    mobileEditMode: false,
  });
  // left = navigator (280) + HUD reserve (310); right = inspector dock (380)
  assert.deepEqual(pad, { left: 280 + MOBILE_EDIT_HUD_RESERVE_PX, right: 380 });

  const desktopPad = resolveDeviceFrameHostPadding({
    isPhone: false,
    navigatorOpen: true,
    navigatorWidth: 280,
    inspectorOpen: true,
    device: "mobile",
    mobileEditMode: false,
  });
  // Mobile device switcher alone (no mobileEditMode) — no HUD reserve.
  assert.deepEqual(desktopPad, { left: 280, right: 380 });
});

test("device-frame skeleton shows only for the active unloaded tier", () => {
  const loaded = new Set<"tablet" | "mobile">(["tablet"]);
  assert.equal(
    shouldShowDeviceFrameSkeleton({ device: "tablet", loadedTiers: loaded }),
    false,
  );
  assert.equal(
    shouldShowDeviceFrameSkeleton({ device: "mobile", loadedTiers: loaded }),
    true,
  );
  assert.equal(
    shouldShowDeviceFrameSkeleton({ device: "desktop", loadedTiers: loaded }),
    false,
  );
});

test("edit-shell wires reserve gutters, skeleton, and warm-keep load tracking", () => {
  const shell = readFileSync(join(THIS_DIR, "edit-shell.tsx"), "utf8");
  assert.match(shell, /resolveDeviceFrameHostPadding/);
  assert.match(shell, /shouldShowDeviceFrameSkeleton/);
  assert.match(shell, /data-device-frame-skeleton/);
  assert.match(shell, /Loading preview/);
  assert.match(shell, /setLoadedTiers/);
});

test("CanvasZoomControls hides on tablet/mobile so it cannot cover the device card", () => {
  const src = readFileSync(join(THIS_DIR, "canvas-viewport.tsx"), "utf8");
  assert.match(src, /device\s*!==\s*"desktop"/);
  assert.match(src, /useMaybeEditContext|useEditContext/);
});

test("classic header CTA shrinks/ellipsis at 390 so it stays in the bar", () => {
  const css = readFileSync(join(THIS_DIR, "../../app/token-presets.css"), "utf8");
  const marker = "/* TUL-397: \"Get in touch\"";
  const at = css.indexOf(marker);
  assert.ok(at >= 0, "TUL-397 header CTA comment missing");
  const slice = css.slice(at, at + 280);
  assert.match(slice, /\.site-header__cta\s*\{/);
  assert.match(slice, /text-overflow:\s*ellipsis/);
  assert.match(slice, /max-width:\s*min\(9\.5rem,\s*38vw\)/);
});
