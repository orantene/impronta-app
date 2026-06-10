import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isAnyBuilderNodeCanvasMounted,
  isClientBuilderCanvasMounted,
  isSectionChildrenCanvasMounted,
  registerClientBuilderCanvasMount,
  registerSectionChildrenCanvasMount,
} from "./client-builder-canvas-bridge";

// builder-perf-2026 — the mounted-count signals gate the per-edit refresh-skip in
// edit-context. The SAFETY property: with NO canvas mounted, isAny…Mounted() is
// false, so the per-edit router.refresh() ALWAYS fires (identical to the legacy
// server-render path). This is what makes flipping the client-canvas flag safe for
// every page shape — only a page that actually mounts a canvas skips the refresh.

test("no canvas mounted → all signals false (refresh fires — the safe default)", () => {
  // Fresh module state: nothing registered yet.
  assert.equal(isClientBuilderCanvasMounted(), false);
  assert.equal(isSectionChildrenCanvasMounted(), false);
  assert.equal(isAnyBuilderNodeCanvasMounted(), false);
});

test("full-page canvas mount flips only the full-page + any signals", () => {
  const release = registerClientBuilderCanvasMount();
  assert.equal(isClientBuilderCanvasMounted(), true);
  assert.equal(isSectionChildrenCanvasMounted(), false); // distinct signal
  assert.equal(isAnyBuilderNodeCanvasMounted(), true);
  release();
  assert.equal(isClientBuilderCanvasMounted(), false);
  assert.equal(isAnyBuilderNodeCanvasMounted(), false);
});

test("section-children mount flips section + any, NOT the full-page signal", () => {
  // Curated-slot pages mount section-children canvases, not the full-page one —
  // so curated-PROP edits (gated on the full-page signal) keep refreshing while
  // builder-node child edits (gated on the 'any' signal) become instant.
  const release = registerSectionChildrenCanvasMount();
  assert.equal(isSectionChildrenCanvasMounted(), true);
  assert.equal(isClientBuilderCanvasMounted(), false);
  assert.equal(isAnyBuilderNodeCanvasMounted(), true);
  release();
  assert.equal(isSectionChildrenCanvasMounted(), false);
  assert.equal(isAnyBuilderNodeCanvasMounted(), false);
});

test("reference-counted: two mounts need two releases (tolerates re-render overlap)", () => {
  const a = registerSectionChildrenCanvasMount();
  const b = registerSectionChildrenCanvasMount();
  assert.equal(isSectionChildrenCanvasMounted(), true);
  a();
  assert.equal(isSectionChildrenCanvasMounted(), true); // still one mount live
  b();
  assert.equal(isSectionChildrenCanvasMounted(), false);
});

test("release is idempotent (double-call cannot underflow the count)", () => {
  const release = registerClientBuilderCanvasMount();
  release();
  release(); // no-op
  // A concurrent live mount must not be dropped by a stale double-release.
  const other = registerClientBuilderCanvasMount();
  assert.equal(isClientBuilderCanvasMounted(), true);
  other();
  assert.equal(isClientBuilderCanvasMounted(), false);
});
