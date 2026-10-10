import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "../../lib/quality/supabase-unchecked-read";
import { editorT } from "./editor-i18n";
import {
  DEVICE_FRAME_BLANK_BEFORE_MS,
  blankMsUntilFirstSignal,
  markTierReadyFromSource,
  skeletonIsImmediate,
} from "./device-frame-blank-timing";

const skeletonSrc = blankComments(
  readFileSync(
    join(process.cwd(), "src/components/edit-chrome/device-frame-skeleton.tsx"),
    "utf8",
  ),
);

const shellSrc = blankComments(
  readFileSync(join(process.cwd(), "src/components/edit-chrome/edit-shell.tsx"), "utf8"),
);

test("C1: skeleton is a device frame (radius + shadow + bezel), not a spinner card", () => {
  assert.match(skeletonSrc, /data-device-frame-skeleton=\{tier\}/);
  assert.match(skeletonSrc, /data-device-frame-skeleton-bezel/);
  assert.match(skeletonSrc, /borderRadius:\s*16/);
  assert.match(skeletonSrc, /DEVICE_FRAME_SHADOW|0 24px 64px/);
  assert.doesNotMatch(skeletonSrc, /spinner|Spinner|animate-spin/);
});

test("C1: phone vs tablet body layouts differ (narrow stack vs two-up)", () => {
  assert.match(skeletonSrc, /isPhone/);
  assert.match(skeletonSrc, /gridTemplateColumns:\s*"1fr 1fr"/);
});

test("C1: DeviceFrameSurface paints skeleton until active tier load (warm-keep)", () => {
  assert.match(shellSrc, /DeviceFrameSkeleton/);
  assert.match(shellSrc, /useDeviceFrameWarmKeep/);
  assert.match(shellSrc, /markTierLoaded/);
  assert.match(shellSrc, /onLoad=\{\(\) => markTierLoaded\(d\)\}/);
  assert.match(shellSrc, /showSkeleton/);
  // Frame-matching UI lives in the extracted module — shell must not grow.
  assert.doesNotMatch(shellSrc, /readyTiers|markTierReadyFromSource|editor:ready/);
});

test("C1: skeleton label is translated en+es", () => {
  assert.equal(editorT("Loading preview…", "en"), "Loading preview…");
  assert.equal(editorT("Loading preview…", "es"), "Cargando la vista previa...");
});

test("C1 timing: before fix blank until ready ≈ 5 s (Live QA baseline)", () => {
  const before = blankMsUntilFirstSignal({
    deviceSwitchAt: 0,
    skeletonPaintAt: null,
    iframeReadyAt: DEVICE_FRAME_BLANK_BEFORE_MS,
  });
  assert.equal(before, DEVICE_FRAME_BLANK_BEFORE_MS);
  assert.equal(skeletonIsImmediate({
    deviceSwitchAt: 0,
    skeletonPaintAt: null,
    iframeReadyAt: DEVICE_FRAME_BLANK_BEFORE_MS,
  }), false);
});

test("C1 timing: after fix skeleton paints at switch (0 ms blank)", () => {
  const after = blankMsUntilFirstSignal({
    deviceSwitchAt: 100,
    skeletonPaintAt: 100,
    iframeReadyAt: 100 + DEVICE_FRAME_BLANK_BEFORE_MS,
  });
  assert.equal(after, 0);
  assert.equal(
    skeletonIsImmediate({
      deviceSwitchAt: 100,
      skeletonPaintAt: 100,
      iframeReadyAt: 5100,
    }),
    true,
  );
});

test("C1: markTierReadyFromSource only adds the matching contentWindow tier", () => {
  const winA = { id: "a" };
  const winB = { id: "b" };
  const map = new Map<object, string>([
    [winA, "tablet"],
    [winB, "mobile"],
  ]);
  const ready0 = new Set<string>();
  const ready1 = markTierReadyFromSource(ready0, map, winA);
  assert.deepEqual([...ready1], ["tablet"]);
  const ready2 = markTierReadyFromSource(ready1, map, winB);
  assert.deepEqual([...ready2].sort(), ["mobile", "tablet"]);
  const ready3 = markTierReadyFromSource(ready2, map, winA);
  assert.equal(ready3, ready2);
  assert.deepEqual([...markTierReadyFromSource(ready0, map, null)], []);
});
