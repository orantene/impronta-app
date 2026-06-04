import assert from "node:assert/strict";
import { test } from "node:test";

import {
  WORKSPACE_LAYOUT_STORAGE_KEY,
  MAGNET_THRESHOLD_PX,
  parseWorkspaceLayout,
  serializeWorkspaceLayout,
  loadWorkspaceLayout,
  saveWorkspaceLayout,
  clearWorkspaceLayout,
  savedOffsetForPanel,
  computeMagnetSnap,
  type LayoutStorage,
  type SnapRect,
} from "./workspace-layout";

// ── tiny in-memory storage stub matching the LayoutStorage surface ──────────
function makeStorage(seed?: Record<string, string>): LayoutStorage & {
  dump: () => Record<string, string>;
} {
  const map = new Map<string, string>(Object.entries(seed ?? {}));
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => {
      map.set(k, v);
    },
    removeItem: (k) => {
      map.delete(k);
    },
    dump: () => Object.fromEntries(map),
  };
}

// ── persistence shape ────────────────────────────────────────────────────────

test("serialize → parse round-trips the persisted panel offsets", () => {
  const json = serializeWorkspaceLayout({
    navigator: { x: 120, y: -40 },
    inspector: { x: -200, y: 16 },
  });
  const parsed = parseWorkspaceLayout(json);
  assert.ok(parsed);
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.panels.navigator, { x: 120, y: -40 });
  assert.deepEqual(parsed.panels.inspector, { x: -200, y: 16 });
});

test("serialized JSON has the exact { version, panels } shape", () => {
  const json = serializeWorkspaceLayout({ navigator: { x: 1.6, y: 2.4 } });
  const raw = JSON.parse(json);
  assert.equal(raw.version, 1);
  // Floats are rounded on the way out so transforms stay pixel-crisp.
  assert.deepEqual(raw.panels, { navigator: { x: 2, y: 2 } });
});

test("parse rejects a null / empty / non-JSON payload", () => {
  assert.equal(parseWorkspaceLayout(null), null);
  assert.equal(parseWorkspaceLayout(""), null);
  assert.equal(parseWorkspaceLayout("{not json"), null);
});

test("parse rejects a wrong/absent version (forward-compat guard)", () => {
  assert.equal(
    parseWorkspaceLayout(JSON.stringify({ version: 2, panels: {} })),
    null,
  );
  assert.equal(
    parseWorkspaceLayout(JSON.stringify({ panels: { navigator: { x: 1, y: 1 } } })),
    null,
  );
});

test("parse drops malformed panel entries but keeps valid siblings", () => {
  const parsed = parseWorkspaceLayout(
    JSON.stringify({
      version: 1,
      panels: {
        navigator: { x: 10, y: 20 },
        bad1: { x: "nope", y: 5 },
        bad2: { x: 5 },
        bad3: null,
        inspector: { x: 0, y: 0 },
      },
    }),
  );
  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed.panels).sort(), ["inspector", "navigator"]);
  assert.deepEqual(parsed.panels.navigator, { x: 10, y: 20 });
});

test("save → load via storage stub returns the same layout under the v1 key", () => {
  const storage = makeStorage();
  const ok = saveWorkspaceLayout(storage, {
    navigator: { x: 30, y: 40 },
    inspector: { x: -50, y: -10 },
  });
  assert.equal(ok, true);
  assert.ok(WORKSPACE_LAYOUT_STORAGE_KEY in storage.dump());
  const loaded = loadWorkspaceLayout(storage);
  assert.ok(loaded);
  assert.deepEqual(loaded.panels.navigator, { x: 30, y: 40 });
  assert.deepEqual(loaded.panels.inspector, { x: -50, y: -10 });
});

test("clear removes the saved layout → load returns null (reset to default)", () => {
  const storage = makeStorage({
    [WORKSPACE_LAYOUT_STORAGE_KEY]: serializeWorkspaceLayout({
      navigator: { x: 5, y: 5 },
    }),
  });
  assert.ok(loadWorkspaceLayout(storage));
  clearWorkspaceLayout(storage);
  assert.equal(loadWorkspaceLayout(storage), null);
});

test("load / save / clear are no-ops (not throws) when storage is null", () => {
  assert.equal(loadWorkspaceLayout(null), null);
  assert.equal(saveWorkspaceLayout(null, { navigator: { x: 1, y: 1 } }), false);
  assert.doesNotThrow(() => clearWorkspaceLayout(null));
});

test("save returns false when the storage backend throws (quota / private mode)", () => {
  const throwingStorage: LayoutStorage = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
    removeItem: () => {},
  };
  assert.equal(
    saveWorkspaceLayout(throwingStorage, { navigator: { x: 1, y: 1 } }),
    false,
  );
});

test("savedOffsetForPanel returns the entry or null when absent", () => {
  const layout = parseWorkspaceLayout(
    serializeWorkspaceLayout({ navigator: { x: 7, y: 8 } }),
  );
  assert.deepEqual(savedOffsetForPanel(layout, "navigator"), { x: 7, y: 8 });
  assert.equal(savedOffsetForPanel(layout, "inspector"), null);
  assert.equal(savedOffsetForPanel(null, "navigator"), null);
});

// ── magnet snapping ──────────────────────────────────────────────────────────

const VIEWPORT = { width: 1440, height: 900 };
const PANEL = { width: 320, height: 600 };

test("a left edge near the screen edge snaps flush to 0", () => {
  const res = computeMagnetSnap({
    proposed: { left: 6, top: 300 }, // 6px from the screen's left edge
    size: PANEL,
    viewport: VIEWPORT,
    others: [],
  });
  assert.equal(res.left, 0);
  assert.equal(res.guides.x, true);
  // Y had no guide in range → passes through unchanged.
  assert.equal(res.top, 300);
  assert.equal(res.guides.y, false);
});

test("a right edge near the screen's right edge snaps flush", () => {
  // Panel right edge = left + 320. Put it 10px shy of the viewport's right.
  const proposedLeft = VIEWPORT.width - PANEL.width - 10; // right edge at vw-10
  const res = computeMagnetSnap({
    proposed: { left: proposedLeft, top: 100 },
    size: PANEL,
    viewport: VIEWPORT,
    others: [],
  });
  // Snaps so right edge == vw → left == vw - width.
  assert.equal(res.left, VIEWPORT.width - PANEL.width);
  assert.equal(res.guides.x, true);
});

test("a top edge near the screen top snaps to 0", () => {
  const res = computeMagnetSnap({
    proposed: { left: 700, top: 12 },
    size: PANEL,
    viewport: VIEWPORT,
    others: [],
  });
  assert.equal(res.top, 0);
  assert.equal(res.guides.y, true);
  // No X guide in range mid-screen.
  assert.equal(res.left, 700);
  assert.equal(res.guides.x, false);
});

test("edge-aligns the dragged panel's left to another panel's left edge", () => {
  const other: SnapRect = { left: 400, top: 80, width: 320, height: 600 };
  const res = computeMagnetSnap({
    proposed: { left: 400 + 8, top: 500 }, // 8px off the other panel's left
    size: PANEL,
    viewport: VIEWPORT,
    others: [other],
  });
  assert.equal(res.left, 400);
  assert.equal(res.guides.x, true);
});

test("edge-aligns the dragged panel's top to another panel's bottom edge", () => {
  const other: SnapRect = { left: 1000, top: 80, width: 320, height: 600 };
  const otherBottom = other.top + other.height; // 680
  const res = computeMagnetSnap({
    proposed: { left: 1000, top: otherBottom - 7 },
    size: PANEL,
    viewport: VIEWPORT,
    others: [other],
  });
  assert.equal(res.top, otherBottom);
  assert.equal(res.guides.y, true);
});

test("nothing snaps when every guide is outside the threshold", () => {
  const res = computeMagnetSnap({
    proposed: { left: 600, top: 400 },
    size: PANEL,
    viewport: VIEWPORT,
    others: [{ left: 100, top: 100, width: 320, height: 600 }],
  });
  assert.equal(res.left, 600);
  assert.equal(res.top, 400);
  assert.equal(res.guides.x, false);
  assert.equal(res.guides.y, false);
});

test("the NEAREST in-range candidate wins on an axis", () => {
  // Screen-left (0) is 14px away; another panel's left edge (10) is 4px away.
  // The closer candidate (10) should win.
  const other: SnapRect = { left: 10, top: 0, width: 200, height: 600 };
  const res = computeMagnetSnap({
    proposed: { left: 14, top: 400 },
    size: PANEL,
    viewport: VIEWPORT,
    others: [other],
    threshold: MAGNET_THRESHOLD_PX,
  });
  assert.equal(res.left, 10);
  assert.equal(res.guides.x, true);
});

test("threshold is respected exactly at the boundary (inclusive)", () => {
  const res = computeMagnetSnap({
    proposed: { left: MAGNET_THRESHOLD_PX, top: 400 }, // exactly threshold from 0
    size: PANEL,
    viewport: VIEWPORT,
    others: [],
  });
  assert.equal(res.left, 0); // inclusive boundary → snaps
});
