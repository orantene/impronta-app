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
import {
  buildEditChromeGutterStyleCss,
  desktopCanvasContentWidthPx,
  resolveDesktopCanvasRailGutters,
} from "./hero-shift-measure";

const THIS_DIR = dirname(fileURLToPath(import.meta.url));

// Ken-Burns arithmetic is a hypothesis only — see hero-shift-measure.test.ts
// for the scrollLeft probe the studio repro must use.
test("hero slider scale(1.08) overflows ~107px at a 1340px canvas (hypothesis math)", () => {
  assert.equal(HERO_SLIDE_PEAK_SCALE, 1.08);
  assert.equal(heroSlideOverflowPx(1340), 107);
  assert.equal(heroSlideOverflowPx(1280), 102);
  assert.equal(heroSlideOverflowPx(390), 31);
  assert.equal(heroSlideOverflowPx(0), 0);
  assert.equal(heroSlideOverflowPx(1340, 1), 0);
});

test("globals.css pins .site-hero to overflow:clip (clip wins over hidden fallback)", () => {
  const css = readFileSync(join(THIS_DIR, "../../app/globals.css"), "utf8");
  const start = css.indexOf(".site-hero {");
  assert.ok(start >= 0, ".site-hero rule missing");
  const block = css.slice(start, css.indexOf("}", start));
  assert.match(block, /overflow:\s*clip/);
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
  assert.deepEqual(pad, { left: 280 + MOBILE_EDIT_HUD_RESERVE_PX, right: 380 });

  const mobilePad = resolveDeviceFrameHostPadding({
    isPhone: false,
    navigatorOpen: true,
    navigatorWidth: 280,
    inspectorOpen: true,
    device: "mobile",
    mobileEditMode: false,
  });
  assert.deepEqual(mobilePad, { left: 280, right: 380 });
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

test("edit-shell wires reserve gutters + extracted skeleton load tracking", () => {
  const shell = readFileSync(join(THIS_DIR, "edit-shell.tsx"), "utf8");
  assert.match(shell, /resolveDeviceFrameHostPadding/);
  assert.match(shell, /DeviceFrameSkeleton/);
  assert.match(shell, /useDeviceFrameLoadTracking/);
  assert.match(shell, /markTierLoaded/);
  assert.match(shell, /BodyPaddingController/);
  const bodyPad = readFileSync(
    join(THIS_DIR, "body-padding-controller.tsx"),
    "utf8",
  );
  assert.match(bodyPad, /resolveDesktopCanvasRailGutters/);
  assert.match(bodyPad, /buildEditChromeGutterStyleCss/);
  // Must NOT gate body padding at 1024 — that left rails over the canvas at 768/390.
  assert.doesNotMatch(
    bodyPad,
    /@media\s*\(\s*min-width:\s*1024px\s*\)/,
  );
});

test("desktop canvas reserves rail gutters at 768 and 390 (run-6 desktop tier)", () => {
  const DOCK = 120; // COMMAND_DOCK_MIN_SAFE_LEFT_PX
  const RAIL = 120; // INSPECTOR_RAIL_MIN_SAFE_RIGHT_PX
  for (const viewport of [768, 390] as const) {
    const gutters = resolveDesktopCanvasRailGutters({
      previewing: false,
      panelLeft: 0,
      panelRight: 0,
      commandDockSafeLeftPx: DOCK,
      inspectorRailSafeRightPx: RAIL,
    });
    assert.deepEqual(gutters, { left: DOCK, right: RAIL });
    const content = desktopCanvasContentWidthPx({
      viewportWidth: viewport,
      leftGutter: gutters.left,
      rightGutter: gutters.right,
    });
    assert.ok(
      content > 0,
      `viewport ${viewport}: hero content width must stay positive beside rails`,
    );
    // Content sits beside rails, not under them (rails reserved).
    assert.equal(content, viewport - DOCK - RAIL);

    // Injected CSS must also inset fixed transparent headers + clamp 100vw
    // breakouts — body padding alone leaves those under the rails.
    const css = buildEditChromeGutterStyleCss(gutters.left, gutters.right);
    assert.match(css, /padding-left:\s*120px/);
    assert.match(css, /padding-right:\s*120px/);
    assert.match(css, /data-tone="transparent"/);
    assert.match(css, /left:\s*120px\s*!important/);
    assert.match(css, /right:\s*120px\s*!important/);
    assert.match(css, /\.site-prim-fullbleed/);
    assert.match(css, /data-in-editor-canvas-region/);
    assert.match(css, /overflow-x:\s*clip/);
    // Must NOT reintroduce the ≥1024 gate that left 768/390 uncovered.
    assert.doesNotMatch(css, /min-width:\s*1024/);
  }
});

test("CanvasZoomControls hides on tablet/mobile so it cannot cover the device card", () => {
  const src = readFileSync(join(THIS_DIR, "canvas-viewport.tsx"), "utf8");
  assert.match(src, /device\s*!==\s*"desktop"/);
  assert.match(src, /useMaybeEditContext|useEditContext/);
});

test("token-presets does not blanket-ellipsis .site-header__cta at phone widths", () => {
  const css = readFileSync(join(THIS_DIR, "../../app/token-presets.css"), "utf8");
  assert.doesNotMatch(css, /TUL-397:\s*"Get in touch"/);
  // Classic header phone reflow (first max-width:560px near .site-header__cta
  // base rule) must not truncate every theme's CTA.
  const ctaBase = css.indexOf(".site-header__cta { margin-left: auto");
  assert.ok(ctaBase >= 0, "base .site-header__cta rule missing");
  const phoneAt = css.indexOf("@media (max-width: 560px)", ctaBase);
  assert.ok(phoneAt >= 0, "phone reflow media query missing");
  const phoneBlock = css.slice(phoneAt, phoneAt + 900);
  assert.doesNotMatch(phoneBlock, /\.site-header__cta\s*\{[^}]*text-overflow:\s*ellipsis/);
  assert.doesNotMatch(phoneBlock, /\.site-header__cta\s*\{[^}]*max-width:\s*min\(9\.5rem/);
});
