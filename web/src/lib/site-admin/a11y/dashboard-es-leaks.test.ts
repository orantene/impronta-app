/**
 * LOCALE: every `copy.t("English text")` literal has a Spanish entry (TUL-146).
 *
 * The dashboard translates by lookup: `copy.t(value)` returns `ES_TEXT[value]`
 * and falls back to the English `value` when the key is missing. A literal with
 * no entry therefore shows English on a Spanish screen (sign-up, profile,
 * support, services...). This test collects every literal passed to
 * `copy.t("...")` or `dt.t("...")` in files that use `useDashboardText`, and
 * fails on any that no dictionary merged into ES_TEXT contains.
 *
 * Limits: it sees only direct string literals. Text typed straight into JSX,
 * template strings and keys built at runtime are not covered.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const INTERNAL = path.join(SRC, "components/admin/shell/internal");

/**
 * English keys known to be missing until their PR lands. An entry that already
 * has Spanish is harmless; delete it when convenient (it never fails the guard,
 * so it cannot block the PR it is waiting for).
 */
const MISSING_UNTIL_PR_LANDS = new Set<string>([
  // PR #3560 (profile performance card, dashboard-i18n-leaks-1007.ts)
  "No prior week to compare",
  "Unique viewers · 7d",
  "in the last 30 days",
  "Views → inquiries · 30d",
  "Needs profile views to measure",
  "views",
]);

const KEY_LINE = /^\s*(?:"((?:[^"\\]|\\.)+)"|'((?:[^'\\]|\\.)+)')\s*:\s*/gm;
const COPY_CALL = /\b(?:copy|dt)\.t\(\s*"((?:[^"\\]|\\.)+)"\s*\)/g;

const unescape = (s: string) => s.replace(/\\"/g, '"').replace(/\\'/g, "'");

/** Dictionary files reachable from dashboard-i18n.ts through `./dashboard-i18n*` imports. */
function reachableDictionaries(): string[] {
  const seen = new Set<string>();
  const stack = [path.join(INTERNAL, "dashboard-i18n.ts")];
  while (stack.length) {
    const file = stack.pop()!;
    if (seen.has(file) || !existsSync(file)) continue;
    seen.add(file);
    for (const m of readFileSync(file, "utf8").matchAll(/from\s+"\.\/(dashboard-i18n[^"]*)"/g)) {
      stack.push(path.join(INTERNAL, `${m[1]}.ts`));
    }
  }
  return [...seen];
}

function dictionaryKeys(): Set<string> {
  const keys = new Set<string>();
  for (const file of reachableDictionaries()) {
    for (const m of readFileSync(file, "utf8").matchAll(KEY_LINE)) keys.add(unescape(m[1] ?? m[2]));
  }
  return keys;
}

function* sourceFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next") continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.startsWith("dashboard-i18n")) yield full;
  }
}

function usedLiterals(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const file of sourceFiles(SRC)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("useDashboardText")) continue;
    for (const m of src.matchAll(COPY_CALL)) {
      const key = unescape(m[1]);
      if (!/[A-Za-z]{3}/.test(key)) continue;
      const rel = path.relative(SRC, file).split(path.sep).join("/");
      used.set(key, [...(used.get(key) ?? []), rel]);
    }
  }
  return used;
}

test("every copy.t(\"...\") literal has a Spanish entry in the merged dictionaries", () => {
  const have = dictionaryKeys();
  const missing: string[] = [];
  for (const [key, files] of usedLiterals()) {
    if (have.has(key) || MISSING_UNTIL_PR_LANDS.has(key)) continue;
    missing.push(`${JSON.stringify(key)}  in ${[...new Set(files)].join(", ")}`);
  }
  assert.deepEqual(
    missing,
    [],
    `English text with no Spanish entry (shows in English on Spanish screens). Add it to a dashboard-i18n-*.ts map reachable from dashboard-i18n.ts:\n${missing.join("\n")}`,
  );
});

test("the dictionary reaches the files this guard depends on", () => {
  const files = reachableDictionaries().map((f) => path.basename(f));
  assert.ok(files.includes("dashboard-i18n.ts"));
  assert.ok(files.includes("dashboard-i18n-rail.ts"), "the rail dictionary is merged into ES_TEXT");
  assert.ok(files.includes("dashboard-i18n-leaks-146.ts"), "the TUL-146 dictionary is merged into ES_TEXT");
});
