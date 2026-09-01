/**
 * edit-context-value-ratchet.static.test.ts — builder-2027 P1 (1B).
 *
 * THE PROBLEM THIS PROTECTS
 * ─────────────────────────
 * `EditProvider` publishes one context object built by a `useMemo`. Roughly 143
 * components read it. Every dependency in that memo's dep array is therefore a
 * tripwire: when it changes identity, the memo rebuilds, the context value is a
 * new object, and every one of those 143 consumers re-renders — whether or not
 * it reads the thing that changed.
 *
 * Earlier waves moved the per-keystroke offenders OUT of the memo and onto
 * `useSyncExternalStore` micro-stores, so only the components that read them
 * re-render:
 *
 *   builderTree -> builder-tree-bridge   (new array identity per mutation)
 *   saving      -> save-cycle-bridge     (flips twice per save cycle)
 *   dirty       -> dirty-bridge          (flips on the first edit)
 *   hover ids   -> hover-bridge          (changes on every pointer move)
 *   history     -> history-bridge
 *   selection   -> selection-bridge
 *
 * Nothing enforced that. Re-adding `saving` to the dep array is one word, it
 * type-checks, every test passes, and the editor gets slower in a way no gate
 * reports and no reviewer can see in a 228-line dep array. This is the gate.
 *
 * WHAT IT MEASURES, HONESTLY
 * ──────────────────────────
 * The dep array is a source-text property, so a source read is the right tool.
 * This does NOT measure re-render counts (that needs a mounted React tree with
 * ~143 consumers, which this lane cannot build) and it does not claim to. It
 * pins the STRUCTURE that makes the re-render count low.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/edit-context-value-ratchet.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(HERE, "edit-context.tsx"), "utf8");

/** The dep array of the single `value` useMemo, one identifier per entry. */
function valueMemoDeps(source: string): string[] {
  const start = source.indexOf("const value = useMemo<EditContextValue>(");
  assert.notEqual(
    start,
    -1,
    "the provider's `value` useMemo must still be named `value` — this guard " +
      "finds it by that name",
  );
  const depsStart = source.indexOf("\n    [\n", start);
  const depsEnd = source.indexOf("\n    ],\n  );", depsStart);
  assert.ok(
    depsStart !== -1 && depsEnd > depsStart,
    "could not locate the value memo's dependency array",
  );
  return source
    .slice(depsStart, depsEnd)
    .split("\n")
    .map((line) => line.trim().replace(/,$/, ""))
    .filter((line) => line.length > 0 && !line.startsWith("//"));
}

/**
 * Identifiers that MUST NOT appear in the value memo's deps, each with the
 * micro-store that replaced it. RATCHET: entries may be added, never removed —
 * removing one re-permits the regression it was written to stop.
 */
const BANNED_DEPS: Record<string, string> = {
  builderTree:
    "useBuilderTree() (builder-tree-bridge). A new array identity per mutation " +
    "would rebuild the value on every edit.",
  saving:
    "useSaving() (save-cycle-bridge). Flips true then false per save cycle, so " +
    "in the deps it rebuilds the value TWICE per coalesced save.",
  dirty: "useDirty() (dirty-bridge).",
  lastDraftSavedAt:
    "useLastDraftSavedAt() (save-cycle-bridge). Set on save and cleared 4s " +
    "later — two more rebuilds per save.",
  hoveredSectionId:
    "useHoveredSectionId() (hover-bridge). Changes on pointer movement; in the " +
    "deps a hover sweep re-renders every consumer at pointer-event rate.",
  hoveredBuilderNodeId: "useHoveredBuilderNodeId() (hover-bridge).",
};

test("the guard can actually read the dep array", () => {
  // Self-check first: a locator that silently found nothing would make every
  // assertion below pass forever.
  const deps = valueMemoDeps(SOURCE);
  assert.ok(
    deps.length > 100,
    `expected the value memo to have a large dep array, found ${deps.length}. ` +
      "If the memo was legitimately split, update this guard to read the new " +
      "shape rather than deleting it.",
  );
  assert.ok(
    deps.includes("tenantId"),
    "sanity: a known stable dep must be found by the locator",
  );
});

test("no volatile value is in the context value memo's deps", () => {
  const deps = new Set(valueMemoDeps(SOURCE));
  const offenders = Object.keys(BANNED_DEPS).filter((d) => deps.has(d));
  assert.deepEqual(
    offenders,
    [],
    "these volatile values are back in the `value` useMemo deps. Every change " +
      "to one of them rebuilds the context object and re-renders ~143 " +
      "consumers. Read them from their micro-store instead:\n" +
      offenders.map((d) => `  ${d} -> ${BANNED_DEPS[d]}`).join("\n"),
  );
});

test("the micro-stores that replaced them still exist and are still read", () => {
  // A banned dep is only safe to ban while its replacement is real. If a bridge
  // is deleted, this guard would otherwise keep passing while the data it
  // protects has nowhere to come from.
  for (const [file, hook] of [
    ["builder-tree-bridge.ts", "useBuilderTree"],
    ["save-cycle-bridge.ts", "useSaving"],
    ["dirty-bridge.ts", "useDirty"],
    ["hover-bridge.ts", "useHoveredBuilderNodeId"],
  ] as const) {
    const src = readFileSync(join(HERE, file), "utf8");
    assert.match(
      src,
      new RegExp(`export function ${hook}\\b`),
      `${file} must still export ${hook}() — it is the replacement this ratchet ` +
        "assumes exists",
    );
    assert.match(
      src,
      /useSyncExternalStore/,
      `${file} must stay a useSyncExternalStore micro-store; a bridge that ` +
        "re-enters React state defeats the point of moving the value out",
    );
  }
});

test("the provider publishes exactly one context value", () => {
  // Two providers would mean two invalidation surfaces and this guard would
  // only cover one of them.
  const memos = SOURCE.match(/useMemo<EditContextValue>\(/g) ?? [];
  assert.equal(
    memos.length,
    1,
    "expected a single EditContextValue memo; if the context was deliberately " +
      "split, extend this guard to cover every part rather than leaving the " +
      "new ones unguarded",
  );
});
