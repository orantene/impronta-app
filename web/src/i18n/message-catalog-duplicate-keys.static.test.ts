/**
 * message-catalog-duplicate-keys.static.test.ts — the same key path must not be
 * written twice inside one catalog file.
 *
 * WHY THIS EXISTS (the bug it would have caught)
 * ──────────────────────────────────────────────
 * On 2026-08-15, PR #1133 and PR #1135 each added
 * `dashboard.adminWebsite.siteDesign` from a different base. Both merged, and
 * for a stretch `main` carried that key TWICE in `messages/en.json` AND in
 * `messages/es.json`. Nothing went red:
 *
 *   • JSON.parse accepts duplicate members — RFC 8259 calls them merely
 *     "unpredictable", and V8 resolves last-occurrence-wins. So the PARSED
 *     object has one key, and every consumer that starts by parsing is blind
 *     by construction. That is the whole trap, and it is why this guard reads
 *     RAW TEXT: no amount of care applied AFTER JSON.parse can see this.
 *   • `verify:ui-messages` compares the key SETS of en vs es. Two identical
 *     duplications cancel out perfectly — the sets still match.
 *   • `message-key-usage.static.test.ts` proves every `t()` call resolves to a
 *     string in en.json. A duplicated key still resolves. Blind too.
 *
 * The damage is not hypothetical: the two copies drifted (different English
 * from different bases), the LAST one silently won, and the first became an
 * invisible edit — someone's reviewed copy change simply never shipped, with a
 * green PR and a clean diff view.
 *
 * WHERE THIS LIVES AND WHY NOT `check-ui-messages.mjs`
 * ───────────────────────────────────────────────────
 * `verify:ui-messages` is only in the `ci` aggregate script in package.json —
 * `.github/workflows/ci.yml` does NOT run it, and `check:ci-lane-parity` only
 * asserts parity for `test:*` lanes, so a check placed there would never gate a
 * PR. This lane (`test:phase1-i18n`) IS a ci.yml step, and parity is proven.
 * The catalogs' en/es alignment stays with `verify:ui-messages`; single-file
 * well-formedness lives here.
 *
 * SCOPE
 * ─────
 * Every `*.json` in `web/messages/` — en, es, fr today, and anything added
 * later without this file needing an edit. fr.json is a partial catalog on
 * purpose; "partial" is `verify:ui-messages`'s business, not this guard's.
 *
 * WHAT THIS CANNOT SEE
 * ────────────────────
 * Two DIFFERENT key paths carrying the same English string (legitimate:
 * "Save" appears many times). Only an exact repeated member name within one
 * object is a duplicate.
 *
 * LANE
 * ────
 * `npm run test:phase1-i18n` — in both the `ci` aggregate script and
 * `.github/workflows/ci.yml`; `check:ci-lane-parity` proves that pairing.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

/** Absolute path to `web/`, derived from this file rather than from cwd. */
const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MESSAGES_DIR = join(WEB_ROOT, "messages");

export type DuplicateKey = {
  /** Full dotted path of the repeated member, e.g. `dashboard.foo.siteDesign`. */
  path: string;
  /** 1-based line of the first occurrence. */
  firstLine: number;
  /** 1-based line of the repeat. */
  secondLine: number;
};

type Frame = {
  kind: "object" | "array";
  /** Dotted path of the container itself ("" at the document root). */
  path: string;
  /** Member names already seen in THIS object, mapped to their first line. */
  seen: Map<string, number>;
  /** The member name currently being given a value (objects only). */
  currentKey: string | null;
  /** Element counter (arrays only), so nested paths read `list.0.title`. */
  index: number;
};

/**
 * PURE — every repeated member name in one raw JSON document.
 *
 * A hand-rolled scanner rather than a parser because that IS the requirement:
 * `JSON.parse` collapses duplicates before any caller can look, and pulling in
 * a duplicate-preserving parser would add a dependency to a repo-local guard.
 * The scanner only has to be right about four things — string boundaries with
 * escapes, `{`/`}`, `[`/`]`, and the `:` that turns the previous string into a
 * key — because the input is already known to be valid JSON (the catalogs are
 * imported and parsed everywhere else; a malformed one fails long before here).
 */
export function findDuplicateKeys(raw: string): DuplicateKey[] {
  const duplicates: DuplicateKey[] = [];
  const frames: Frame[] = [];
  let line = 1;
  /** The most recent complete string token, awaiting a `:` to become a key. */
  let pendingString: { value: string; line: number } | null = null;

  const top = (): Frame | undefined => frames[frames.length - 1];

  /** Path of a container about to be pushed as the current frame's child. */
  const childPath = (): string => {
    const parent = top();
    if (!parent) return "";
    if (parent.kind === "array") return joinPath(parent.path, String(parent.index));
    return parent.currentKey === null ? parent.path : joinPath(parent.path, parent.currentKey);
  };

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];

    if (ch === "\n") {
      line += 1;
      continue;
    }

    if (ch === '"') {
      const startLine = line;
      let value = "";
      i += 1;
      for (; i < raw.length; i++) {
        const c = raw[i];
        if (c === "\\") {
          // Copy the escape verbatim. Only its LENGTH matters here: the member
          // name is compared against other member names from the same file, so
          // `a` and `a` being different strings is harmless, while
          // mis-counting the escape would end the string early and derail the
          // scan.
          value += c + (raw[i + 1] ?? "");
          i += 1;
          continue;
        }
        if (c === '"') break;
        if (c === "\n") line += 1;
        value += c;
      }
      pendingString = { value, line: startLine };
      continue;
    }

    if (ch === ":") {
      const frame = top();
      if (frame && frame.kind === "object" && pendingString) {
        const { value, line: keyLine } = pendingString;
        const first = frame.seen.get(value);
        if (first !== undefined) {
          duplicates.push({
            path: joinPath(frame.path, value),
            firstLine: first,
            secondLine: keyLine,
          });
        } else {
          frame.seen.set(value, keyLine);
        }
        frame.currentKey = value;
      }
      pendingString = null;
      continue;
    }

    if (ch === "{" || ch === "[") {
      frames.push({
        kind: ch === "{" ? "object" : "array",
        path: childPath(),
        seen: new Map(),
        currentKey: null,
        index: 0,
      });
      pendingString = null;
      continue;
    }

    if (ch === "}" || ch === "]") {
      frames.pop();
      pendingString = null;
      continue;
    }

    if (ch === ",") {
      const frame = top();
      if (frame) {
        if (frame.kind === "array") frame.index += 1;
        else frame.currentKey = null;
      }
      pendingString = null;
      continue;
    }
  }

  return duplicates;
}

function joinPath(prefix: string, segment: string): string {
  return prefix ? `${prefix}.${segment}` : segment;
}

function catalogFiles(): string[] {
  return readdirSync(MESSAGES_DIR)
    .filter((name) => name.endsWith(".json"))
    .sort();
}

// ─── the guard's own selftest ───────────────────────────────────────────────
//
// A scanner that quietly stopped finding anything would leave this file green
// forever, which is precisely the failure mode it was written to end. These
// fixtures make the detector prove it still works on every run.

test("findDuplicateKeys sees what JSON.parse cannot", () => {
  const raw = ['{', '  "a": { "siteDesign": "one" },', '  "b": 1', '}'].join("\n");
  assert.deepEqual(findDuplicateKeys(raw), [], "clean document must report nothing");

  const duped = [
    "{",
    '  "dashboard": {',
    '    "siteDesign": "Site design",',
    '    "other": "x",',
    '    "siteDesign": "Site Design"',
    "  }",
    "}",
  ].join("\n");

  // The trap itself, asserted rather than described: parsing throws away the
  // evidence. If this ever stops holding, the guard below can be simplified.
  const parsed = JSON.parse(duped) as { dashboard: Record<string, string> };
  assert.equal(Object.keys(parsed.dashboard).length, 2);
  assert.equal(parsed.dashboard.siteDesign, "Site Design", "last occurrence wins");

  assert.deepEqual(findDuplicateKeys(duped), [
    { path: "dashboard.siteDesign", firstLine: 3, secondLine: 5 },
  ]);
});

test("findDuplicateKeys is not fooled by values, arrays or escapes", () => {
  // A repeated VALUE is not a duplicate key, and the same member name under
  // two different parents is not either.
  const raw = [
    "{",
    '  "one": { "label": "Save" },',
    '  "two": { "label": "Save" },',
    '  "list": [{ "title": "a" }, { "title": "b" }],',
    '  "escaped": "a \\" b : c { d",',
    '  "quote\\"key": 1',
    "}",
  ].join("\n");
  assert.deepEqual(findDuplicateKeys(raw), []);

  // Duplicates inside an array element are reported with the element index in
  // the path, so the message points at one object rather than at the array.
  const inArray = ['{', '  "list": [', '    {', '      "t": 1,', '      "t": 2', "    }", "  ]", "}"].join(
    "\n",
  );
  assert.deepEqual(findDuplicateKeys(inArray), [
    { path: "list.0.t", firstLine: 4, secondLine: 5 },
  ]);
});

// ─── the real catalogs ──────────────────────────────────────────────────────

test("every messages/*.json catalog defines each key exactly once", () => {
  const files = catalogFiles();
  assert.ok(files.length >= 2, `expected catalogs in ${MESSAGES_DIR}, found ${files.length}`);

  const failures: string[] = [];
  for (const file of files) {
    const raw = readFileSync(join(MESSAGES_DIR, file), "utf8");
    for (const dup of findDuplicateKeys(raw)) {
      failures.push(
        `messages/${file}: "${dup.path}" is defined twice — line ${dup.firstLine} and line ${dup.secondLine}`,
      );
    }
  }

  assert.deepEqual(
    failures,
    [],
    [
      "Duplicate key paths in a message catalog.",
      "",
      ...failures,
      "",
      "JSON.parse keeps the LAST occurrence, so the earlier copy is dead copy that",
      "no gate and no diff view will point at. Delete the copy that is wrong and",
      "keep one definition per key.",
    ].join("\n"),
  );
});
