/**
 * section-derivable-children.test.ts
 *
 * Trap 2 guard — "Unlock design" on a section type that derives NO children
 * reports success and leaves a BLANK section: the operator's content appears
 * to vanish. `sectionTypeHasDerivableChildren` is what the UI gates on, and it
 * must never disagree with what `deriveLegacySectionChildNodes` actually does.
 *
 * WHY THIS CANNOT DRIFT
 * ─────────────────────
 * The predicate reads `SECTION_CHILD_DERIVERS`, the same table the derivation
 * dispatches through, so a new section type is either in the table (predicate
 * true, deriver runs) or absent (predicate false, `[]`). There is no parallel
 * hand-kept list to forget to update.
 *
 * This test proves the pairing BEHAVIOURALLY rather than trusting that
 * structure: for every section type the platform knows about, it runs the real
 * derivation against a battery of prop probes and asserts
 *
 *     sectionTypeHasDerivableChildren(key) === (some probe yields children)
 *
 * Both directions matter:
 *   • predicate TRUE but nothing ever derives → the UI offers an unlock that
 *     empties the section. This is the Trap 2 bug.
 *   • predicate FALSE but something derives → a working unlock is hidden.
 *
 * Derivers are prop-driven (a `hero` with blank props legitimately derives
 * nothing), so a single probe cannot exercise them all. The probe battery
 * below covers the shapes derivers actually read — strings, numbers, booleans,
 * objects of strings, arrays of strings, arrays of objects of strings — via
 * proxies that answer EVERY property, so no deriver's specific prop names have
 * to be enumerated here either.
 *
 * Lane: `test:builder-node-bindings` (globs `src/lib/site-admin/builder-node`).
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  deriveLegacySectionChildNodes,
  sectionTypeHasDerivableChildren,
} from "./snapshot-slot-bridge";

const HERE = dirname(fileURLToPath(import.meta.url));
const BRIDGE_PATH = join(HERE, "snapshot-slot-bridge.ts");
const REGISTRY_PATH = join(
  HERE,
  "..",
  "sections",
  "registry.ts",
);

/** Every key registered in the curated `SECTION_REGISTRY` object literal. */
function readRegistrySectionKeys(): string[] {
  const source = readFileSync(REGISTRY_PATH, "utf8");
  const startMarker = "export const SECTION_REGISTRY = {";
  const startIdx = source.indexOf(startMarker);
  assert.ok(startIdx >= 0, "SECTION_REGISTRY literal not found in registry.ts");
  const endIdx = source.indexOf("} as const;", startIdx);
  assert.ok(endIdx >= 0, "SECTION_REGISTRY closing '} as const;' not found");
  const body = source.slice(startIdx + startMarker.length, endIdx);
  const keys: string[] = [];
  const lineRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*):\s+\w+Section,/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(body)) !== null) keys.push(match[1]!);
  return keys;
}

/** Every key present in the deriver table, read from the source literal so a
 * renamed/added entry is picked up without touching this file. */
function readDeriverTableKeys(): string[] {
  const source = readFileSync(BRIDGE_PATH, "utf8");
  const startMarker =
    "const SECTION_CHILD_DERIVERS: Record<string, SectionChildDeriver> = {";
  const startIdx = source.indexOf(startMarker);
  assert.ok(startIdx >= 0, "SECTION_CHILD_DERIVERS literal not found");
  const endIdx = source.indexOf("\n};", startIdx);
  assert.ok(endIdx >= 0, "SECTION_CHILD_DERIVERS closing '};' not found");
  const body = source.slice(startIdx + startMarker.length, endIdx);
  const keys: string[] = [];
  const lineRe = /^\s*([a-zA-Z_][a-zA-Z0-9_]*):\s+\w+ChildNodes,/gm;
  let match: RegExpExecArray | null;
  while ((match = lineRe.exec(body)) !== null) keys.push(match[1]!);
  return keys;
}

/** An object that answers every property read with `value`. Lets a probe
 * satisfy any prop name a deriver looks for without enumerating them. */
function answerEverything(value: unknown): Record<string, unknown> {
  return new Proxy(
    {},
    {
      get: (_t, key) => (typeof key === "symbol" ? undefined : value),
      has: () => true,
      ownKeys: () => [],
      getOwnPropertyDescriptor: () => undefined,
    },
  ) as Record<string, unknown>;
}

const TEXT = "Probe copy";
const stringObject = () => answerEverything(TEXT);

/** Prop shapes derivers read. Union over all of them = "can this type ever
 * derive children at all". */
const PROBES: ReadonlyArray<Record<string, unknown>> = [
  answerEverything(TEXT),
  answerEverything(3),
  answerEverything(true),
  answerEverything("/probe"),
  answerEverything(stringObject()),
  answerEverything([TEXT, TEXT, TEXT]),
  answerEverything([stringObject(), stringObject(), stringObject()]),
  answerEverything([answerEverything(stringObject())]),
];

function derivesAnythingEver(sectionTypeKey: string): boolean {
  return PROBES.some((props) => {
    let children: unknown[] = [];
    try {
      children = deriveLegacySectionChildNodes("probe:node", {
        slotKey: "body",
        sortOrder: 0,
        sectionId: "probe-section",
        sectionTypeKey,
        name: sectionTypeKey,
        props,
      });
    } catch {
      // A deriver that throws on an exotic probe shape simply derives nothing
      // for that shape; another probe may still succeed.
      return false;
    }
    return children.length > 0;
  });
}

/** Union of every section type key the platform can put on a page: the curated
 * registry, plus the deriver table (which also covers site_header/site_footer
 * and other non-registry embeds). */
function allSectionTypeKeys(): string[] {
  return [
    ...new Set([
      ...readRegistrySectionKeys(),
      ...readDeriverTableKeys(),
      "blank_section",
      "header_search",
      "header_account",
      "header_inquiry",
      "header_favorites",
      "header_language",
    ]),
  ].sort();
}

test("the derivable-children predicate agrees with the real derivation for every section type", () => {
  const keys = allSectionTypeKeys();
  assert.ok(keys.length > 40, `expected the full section catalog, got ${keys.length}`);

  const disagreements: string[] = [];
  for (const key of keys) {
    const predicate = sectionTypeHasDerivableChildren(key);
    const actual = derivesAnythingEver(key);
    if (predicate !== actual) {
      disagreements.push(
        `${key}: sectionTypeHasDerivableChildren=${predicate} but derivation yields children=${actual}`,
      );
    }
  }

  assert.deepEqual(
    disagreements,
    [],
    [
      "The unlock affordance has drifted from what unlocking actually does.",
      "A type the predicate calls derivable but that derives nothing would",
      "unlock into a BLANK section (the Trap 2 data-loss bug); a type the",
      "predicate calls non-derivable but that derives children hides a working",
      "unlock. Fix SECTION_CHILD_DERIVERS in snapshot-slot-bridge.ts.",
      ...disagreements,
    ].join("\n"),
  );
});

test("the section types that cannot be unlocked are exactly the ones with no deriver", () => {
  const notUnlockable = allSectionTypeKeys().filter(
    (key) => !sectionTypeHasDerivableChildren(key),
  );
  // Pinned so a type silently losing its deriver (and therefore silently
  // losing its unlock affordance) shows up in a diff.
  assert.deepEqual(notUnlockable, [
    "anchor_nav",
    "blank_section",
    "header_account",
    "header_favorites",
    "header_inquiry",
    "header_language",
    "header_search",
    "join_register",
    "marquee",
  ]);
});

test("an unknown section type is reported as non-derivable, not silently unlockable", () => {
  assert.equal(sectionTypeHasDerivableChildren("not_a_real_section"), false);
  assert.deepEqual(
    deriveLegacySectionChildNodes("probe:node", {
      slotKey: "body",
      sortOrder: 0,
      sectionId: "probe-section",
      sectionTypeKey: "not_a_real_section",
      name: "nope",
      props: answerEverything(TEXT),
    }),
    [],
  );
});
