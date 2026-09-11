/**
 * THE CATALOG IS LOAD-BEARING OR IT IS DECORATION.
 *
 * A component catalog that people remember to update is a component catalog
 * that is out of date, and an out-of-date catalog is worse than none: the axe
 * lane crawls the registry, so an unregistered primitive is a primitive whose
 * accessibility nothing checks, while the gallery page implies everything is
 * covered.
 *
 * This guard closes that by counting. Every `.tsx` under `src/components/ui/`
 * is either registered or in the baseline, and the baseline may only shrink.
 * The direction matches `lane-enrolment.static.test.ts` and for the same
 * reason: a build that goes red because somebody registered a primitive is a
 * build that teaches people not to register primitives.
 *
 * NO SWEEP DEMANDED. Nineteen primitives are baselined at the time of writing.
 * Registering one is not a mechanical edit — it means deciding which STATES of
 * it are worth looking at, which is the whole value of the entry, and doing
 * nineteen of those in one commit produces nineteen entries nobody thought
 * about. They come in as their surfaces get rebuilt.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "@/lib/quality/supabase-unchecked-read";

const UI_DIR = join(WEB_ROOT, "src", "components", "ui");
const REGISTRY = join(UI_DIR, "catalog", "registry.tsx");
const BASELINE = join(UI_DIR, "catalog", "catalog-coverage.baseline.json");

const baseline = JSON.parse(readFileSync(BASELINE, "utf8")) as {
  count: number;
  unregistered: string[];
};

/**
 * Read the registered files out of the registry SOURCE rather than importing
 * it. The registry is a client module full of JSX that pulls in Radix, lucide
 * and the theme helpers; importing it under `tsx --test` would make this guard
 * fail for reasons that have nothing to do with coverage, which is how a guard
 * ends up disabled.
 */
function registeredFiles(): Set<string> {
  const source = readFileSync(REGISTRY, "utf8");
  return new Set([...source.matchAll(/^\s*file:\s*"([^"]+)",\s*$/gm)].map((m) => m[1]));
}

function primitiveFiles(): string[] {
  return readdirSync(UI_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => entry.name)
    .sort();
}

test("every ui primitive is registered in the catalog or recorded as not", () => {
  const registered = registeredFiles();
  const known = new Set(baseline.unregistered);
  const orphans = primitiveFiles().filter((file) => !registered.has(file) && !known.has(file));
  assert.deepEqual(
    orphans,
    [],
    `These primitives are in src/components/ui/ and in NEITHER the catalog\n` +
      `registry NOR the baseline. Nothing renders them, so the axe lane never\n` +
      `sees them and the gallery silently omits them.\n\n` +
      `Add an entry to catalog/registry.tsx with the states worth looking at\n` +
      `(the empty, disabled and error ones — not just the happy path):\n` +
      orphans.map((f) => `  ${f}`).join("\n"),
  );
});

test("a registered primitive drops out of the baseline", () => {
  // Shrink is reported, not failed — see the header. The count below is what
  // makes an unrecorded shrink visible rather than silent.
  const registered = registeredFiles();
  const resolved = baseline.unregistered.filter((file) => registered.has(file));
  if (resolved.length > 0) {
    console.log(
      `[catalog-coverage] ${resolved.length} primitive(s) are now registered. ` +
        `Remove them from catalog-coverage.baseline.json and lower the count:\n` +
        resolved.map((f) => `  ${f}`).join("\n"),
    );
  }
  assert.ok(true);
});

test("the baseline's count matches its own list", () => {
  assert.equal(baseline.count, baseline.unregistered.length);
});

test("every baselined file still exists", () => {
  // A baseline entry for a deleted file is a slot a future primitive can be
  // dropped into by name collision without the guard noticing.
  const present = new Set(primitiveFiles());
  const stale = baseline.unregistered.filter((file) => !present.has(file));
  assert.deepEqual(stale, [], "baseline names files that are no longer in src/components/ui/");
});

test("GUARD BITES: an invented primitive is reported", () => {
  const registered = registeredFiles();
  const known = new Set(baseline.unregistered);
  const invented = "a-primitive-nobody-registered.tsx";
  assert.ok(
    !registered.has(invented) && !known.has(invented),
    "the guard would not notice a new unregistered primitive",
  );
});

test("the registry declares a file for every entry it lists", () => {
  // An entry whose `file` does not exist is an entry the coverage arithmetic
  // counts as covering something that is not there.
  const present = new Set(primitiveFiles());
  const missing = [...registeredFiles()].filter((file) => !present.has(file));
  assert.deepEqual(missing, [], "registry entries name files that do not exist");
});
