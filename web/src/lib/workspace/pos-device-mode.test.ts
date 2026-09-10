/**
 * The top-bar switch's gate and its device memory, driven with real inputs.
 *
 * Lane: `npm run test:tenant-isolation`, beside `pos-bridge.test.ts` and
 * `mobile-more-actions.test.ts` — the two other gates on the same pair of
 * facts (the platform switch and the workspace's modes).
 */
import test from "node:test";
import assert from "node:assert/strict";

import type { PosMode } from "@/lib/pos/modes";
import {
  posDeviceModeStorageKey,
  posSwitchModel,
  readDevicePosMode,
  writeDevicePosMode,
} from "./pos-device-mode";

const ALL: readonly PosMode[] = ["counter", "floor", "door", "classes", "projects"];

function model(over: Partial<Parameters<typeof posSwitchModel>[0]> = {}) {
  return posSwitchModel({
    posEnabled: true,
    role: "owner",
    workspaceEnabledModes: ["counter"],
    remembered: null,
    onPos: false,
    ...over,
  });
}

test("the platform kill switch alone hides the control, even for an owner", () => {
  // This is the ship-dark rule. The counter can be fully built and fully
  // enabled on the workspace and STILL show no entry point until HQ turns
  // `platform_settings.workspace_pos_enabled` on.
  assert.deepEqual(model({ posEnabled: false }), { visible: false });
  assert.deepEqual(model({ posEnabled: false, workspaceEnabledModes: ALL }), { visible: false });
});

test("an assistant sees no switch at all", () => {
  // "Assistant" is `viewer` on the ladder: read-only, and the point of sale
  // moves money and stock. `modesForPerson` gives that rank nothing, so the
  // control has nothing to offer and renders nothing rather than an empty
  // menu.
  assert.deepEqual(model({ role: "viewer", workspaceEnabledModes: ALL }), { visible: false });
});

test("a workspace with every mode switched off hides the control", () => {
  assert.deepEqual(model({ workspaceEnabledModes: [] }), { visible: false });
});

test("the menu offers only the modes this person may actually use", () => {
  // An editor is frontline staff: everything except the Projects board.
  const editor = model({ role: "editor", workspaceEnabledModes: ALL });
  assert.ok(editor.visible);
  assert.deepEqual(editor.modes, ["counter", "floor", "door", "classes"]);

  // A manager adds Projects, and order follows the registry, not the input.
  const manager = model({ role: "manager", workspaceEnabledModes: ["projects", "counter"] });
  assert.ok(manager.visible);
  assert.deepEqual(manager.modes, ["counter", "projects"]);
});

test("first paint never depends on what the device remembers", () => {
  // `remembered: null` is the pre-effect state, and it must resolve to a
  // value the SERVER can compute from the same inputs — the first allowed
  // mode. A control whose label came from storage on the first render would
  // paint one thing on the server and another on hydration.
  const beforeEffect = model({ workspaceEnabledModes: ["counter", "floor"], remembered: null });
  assert.ok(beforeEffect.visible);
  assert.equal(beforeEffect.currentMode, "counter");
  assert.equal(beforeEffect.currentIsRemembered, false);

  const afterEffect = model({ workspaceEnabledModes: ["counter", "floor"], remembered: "floor" });
  assert.ok(afterEffect.visible);
  assert.equal(afterEffect.currentMode, "floor");
  assert.equal(afterEffect.currentIsRemembered, true);
});

test("a remembered mode the person may no longer use is ignored, not honoured", () => {
  // A demoted cashier's tablet still has `projects` in its storage. Opening
  // it would be refused by the route and redirected, which the user sees as
  // a flicker; treating it as unremembered is the honest answer.
  const demoted = model({
    role: "editor",
    workspaceEnabledModes: ALL,
    remembered: "projects",
  });
  assert.ok(demoted.visible);
  assert.equal(demoted.currentMode, "counter");
  assert.equal(demoted.currentIsRemembered, false);
});

test("which half reads as selected comes from the surface, not from storage", () => {
  const off = model({ onPos: false });
  assert.ok(off.visible);
  assert.equal(off.active, "workspace");
  const on = model({ onPos: true });
  assert.ok(on.visible);
  assert.equal(on.active, "pos");
});

test("two workspaces on one device do not share a remembered mode", () => {
  assert.notEqual(posDeviceModeStorageKey("cafe"), posDeviceModeStorageKey("studio"));
  assert.match(posDeviceModeStorageKey("cafe"), /cafe$/);
  // Standalone/prototype mode has no tenant key and still needs somewhere.
  assert.match(posDeviceModeStorageKey(null), /default$/);
  assert.match(posDeviceModeStorageKey("   "), /default$/);
});

test("the device memory round-trips, and refuses a mode that is not allowed", () => {
  const store = new Map<string, string>();
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  });
  try {
    assert.equal(readDevicePosMode(ALL, "cafe"), null);
    writeDevicePosMode("floor", "cafe");
    assert.equal(readDevicePosMode(ALL, "cafe"), "floor");
    // Another workspace's key is untouched by that write.
    assert.equal(readDevicePosMode(ALL, "studio"), null);
    // Stale value, narrowed away rather than returned.
    assert.equal(readDevicePosMode(["counter"], "cafe"), null);
    // Garbage in storage is not a mode.
    store.set(posDeviceModeStorageKey("cafe"), "till");
    assert.equal(readDevicePosMode(ALL, "cafe"), null);
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("storage that throws on every call is survivable", () => {
  // Safari private mode: the object exists, the methods throw. A till that
  // cannot remember must still sell.
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      getItem() {
        throw new Error("blocked");
      },
      setItem() {
        throw new Error("blocked");
      },
    },
  });
  try {
    assert.equal(readDevicePosMode(ALL, "cafe"), null);
    assert.doesNotThrow(() => writeDevicePosMode("counter", "cafe"));
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else Reflect.deleteProperty(globalThis, "localStorage");
  }
});

test("no storage at all (a server render) is survivable", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  Reflect.deleteProperty(globalThis, "localStorage");
  try {
    assert.equal(readDevicePosMode(ALL, "cafe"), null);
    assert.doesNotThrow(() => writeDevicePosMode("counter", "cafe"));
  } finally {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
  }
});
