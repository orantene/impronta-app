/**
 * command-dock-ia.static.test.ts — dock information-architecture guard (W2-C3).
 *
 * The builder cockpit's left dock was collapsed from 8-9 entry points to SIX
 * plain-language items — Add · Pages · Structure · Design · Assets · Help — and
 * the rail's drag / pin / collapse meta-chrome (plus its persisted storage
 * keys) was removed so the dock reads as "top minimal". This guard reads the
 * SOURCE TEXT and fails if a future edit re-inflates the dock or reintroduces
 * the meta-chrome, so the IA can't silently regress.
 *
 * WHY FILE-TEXT SCAN: importing the dock pulls the React / Next graph; a plain
 * UTF-8 text scan is zero-overhead and asserts exactly the shape we mandate.
 *
 * Test runner: node:test + node:assert/strict
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(resolve(HERE, rel), "utf8");

const DOCK = read("command-dock.tsx");
const TOKENS = read("kit/tokens.ts");
const KIT_INDEX = read("kit/index.ts");

/** The exact, complete set of dock item ids (5 primary + Help). */
const EXPECTED_DOCK_ITEM_IDS = [
  "add",
  "pages",
  "structure",
  "design",
  "assets",
  "help",
];

/** Entry points intentionally removed from the dock in W2-C3. */
const REMOVED_DOCK_ITEM_IDS = ["search", "pageSettings", "brand", "theme"];

test("command dock declares exactly the six canonical item ids", () => {
  const ids = [...DOCK.matchAll(/\bid:\s*"([a-zA-Z]+)"/g)].map((m) => m[1]);
  assert.deepEqual(
    ids,
    EXPECTED_DOCK_ITEM_IDS,
    `dock item ids drifted — expected exactly ${EXPECTED_DOCK_ITEM_IDS.join(
      " · ",
    )} in order, got ${ids.join(" · ")}`,
  );
  assert.equal(ids.length, 6, "dock must have exactly 6 items");
});

test("removed dock entry points are gone from the dock", () => {
  for (const removed of REMOVED_DOCK_ITEM_IDS) {
    assert.ok(
      !DOCK.includes(`id: "${removed}"`),
      `dock still declares a removed item id "${removed}"`,
    );
  }
});

test("dock no longer imports the pin / collapse rail meta-chrome", () => {
  for (const banned of [
    "RailHandle",
    "PinnableRailItem",
    "useRailCollapsed",
    "useRailPinned",
  ]) {
    assert.ok(
      !DOCK.includes(banned),
      `command-dock.tsx still references removed meta-chrome "${banned}"`,
    );
  }
});

test("dead collapse / pin storage keys are removed from tokens + kit barrel", () => {
  for (const key of [
    "COMMAND_DOCK_COLLAPSED_STORAGE_KEY",
    "COMMAND_DOCK_PINNED_STORAGE_KEY",
    "INSPECTOR_RAIL_COLLAPSED_STORAGE_KEY",
    "INSPECTOR_RAIL_PINNED_STORAGE_KEY",
  ]) {
    assert.ok(
      !new RegExp(`export const ${key}\\b`).test(TOKENS),
      `tokens.ts still exports dead storage key ${key}`,
    );
    assert.ok(
      !KIT_INDEX.includes(key),
      `kit/index.ts still re-exports dead storage key ${key}`,
    );
  }
});

test("rail-handle + rail-pin kit modules are deleted", () => {
  assert.ok(
    !existsSync(resolve(HERE, "kit/rail-handle.tsx")),
    "kit/rail-handle.tsx should have been removed",
  );
  assert.ok(
    !existsSync(resolve(HERE, "kit/rail-pin.tsx")),
    "kit/rail-pin.tsx should have been removed",
  );
});

test("Design is a single dock entry that reuses the brand-panel open state", () => {
  assert.ok(
    /id:\s*"design"/.test(DOCK) && DOCK.includes("toggleBrandPanel"),
    "the Design dock item must toggle the (reused) brand-panel open state",
  );
});
