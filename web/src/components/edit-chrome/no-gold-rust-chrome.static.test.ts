/**
 * no-gold-rust-chrome.static.test.ts — admin-chrome color guard (W2-C1).
 *
 * OWNER RULE (binding): the editor chrome (Tulala's own product UI) must never
 * use gold / rust / amber accents. The most-seen offender was the rust-gold
 * "Unpublished changes" dirty-state pill (`CHROME.amber = #b45309` + its glow
 * `rgba(180,83,9,...)`), plus a few hardcoded siblings. W2-C1 retoned the amber
 * token to the cool BLUE "attention / pending" role and purged the hardcoded
 * rust-gold literals from chrome.
 *
 * This guard reads the SOURCE TEXT of edit-chrome and FAILS if the rust-gold
 * amber family reappears, so a future edit can't silently reintroduce it.
 *
 * Scope: `src/components/edit-chrome/**` (the chrome). This does NOT scan the
 * per-tenant theme system (`lib/site-admin/tokens/**`) or tenant CONTENT color
 * pickers — tenants may legitimately choose any brand color, including golds.
 *
 * WHY FILE-TEXT SCAN: importing chrome pulls the React / Next graph; a plain
 * UTF-8 text scan is zero-overhead and catches exactly the literal we forbid.
 *
 * Test runner: node:test + node:assert/strict
 * Run:  node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/no-gold-rust-chrome.static.test.ts
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const CHROME_ROOT = resolve(HERE); // src/components/edit-chrome

/**
 * The banned rust-gold "amber" family. `#b45309` is the exact rust-gold that
 * shipped; `180, 83, 9` / `180,83,9` is the same hue as an rgb(a) triple. If a
 * future warning needs a caution color, use the cool BLUE "attention" role
 * (CHROME.amber, now #2c5fdb) or rose for errors, never gold/rust.
 */
const RUST_GOLD_RE = /#b45309\b|180\s*,\s*83\s*,\s*9\b/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      walk(full, out);
    } else if (
      /\.(ts|tsx)$/.test(name) &&
      !name.includes(".test.") &&
      !name.includes(".static.")
    ) {
      out.push(full);
    }
  }
  return out;
}

test("self-check: the rust-gold matcher actually catches the banned family", () => {
  assert.equal(RUST_GOLD_RE.test('background: "#b45309"'), true);
  assert.equal(RUST_GOLD_RE.test("rgba(180, 83, 9, 0.6)"), true);
  assert.equal(RUST_GOLD_RE.test("rgba(180,83,9,0.1)"), true);
  // The cool retone target must NOT trip the matcher.
  assert.equal(RUST_GOLD_RE.test("rgba(58, 123, 255, 0.1)"), false);
  assert.equal(RUST_GOLD_RE.test('"#2c5fdb"'), false);
});

test("no rust-gold / amber accents anywhere in edit-chrome source", () => {
  const offenders: string[] = [];
  for (const file of walk(CHROME_ROOT)) {
    const text = readFileSync(file, "utf8");
    text.split("\n").forEach((line, i) => {
      if (RUST_GOLD_RE.test(line)) {
        offenders.push(`${file.slice(CHROME_ROOT.length + 1)}:${i + 1}  ${line.trim()}`);
      }
    });
  }
  assert.equal(
    offenders.length,
    0,
    `Gold/rust (amber) is banned in admin chrome. Use the cool "attention" ` +
      `role (CHROME.amber = #2c5fdb) or rose for errors. Offenders:\n` +
      offenders.join("\n"),
  );
});
