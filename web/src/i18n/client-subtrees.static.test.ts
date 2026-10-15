/**
 * Guard for the catalog-free browser translator (see ./client-subtrees.ts).
 *
 * A client component that calls `createTranslator` / `getMessageStringArray`
 * directly reads only CLIENT_MESSAGE_SUBTREES in the browser. A key outside them
 * renders as the raw key and mismatches the server HTML, so every literal key
 * in those files must sit under a listed subtree, and every listed subtree must
 * exist in en.json.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import en from "../../messages/en.json";

import { CLIENT_MESSAGE_SUBTREES, pickClientSubtrees } from "./client-subtrees";

const WEB = join(__dirname, "..", "..");

function directClientTranslatorFiles(): string[] {
  const listed = execSync(`git grep -lE "i18n/(messages|translator-for|use-public-t)\\"" -- src`, { cwd: WEB, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((f) => f && !/\.test\.tsx?$/.test(f));
  return listed.filter((f) => {
    const src = readFileSync(join(WEB, f), "utf8");
    // Importers of the light modules are browser code even when they are plain hook
    // modules without a "use client" directive.
    const lightImporter = /i18n\/(translator-for|use-public-t)"/.test(src);
    return (lightImporter || /^\s*["']use client["']/.test(src)) && /\b(createTranslator|getMessageStringArray|translatorFor|usePublicT)\b/.test(src);
  });
}

test("client translator files exist (the scan is not silently empty)", () => {
  assert.ok(directClientTranslatorFiles().length >= 20);
});

test("every literal key in a direct client translator file is under a listed subtree", () => {
  const allowed = new Set<string>(CLIENT_MESSAGE_SUBTREES);
  const misses: string[] = [];
  for (const f of directClientTranslatorFiles()) {
    const src = readFileSync(join(WEB, f), "utf8");
    const calls = src.matchAll(/\b(?:t|copy|getMessageStringArray\([^,]+,)\s*\(?\s*["'`]([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\./g);
    for (const m of calls) {
      const [ns, sub] = [m[1], m[2]];
      const top = (en as Record<string, unknown>)[ns];
      if (!top || typeof top !== "object") continue;
      if (!allowed.has(`${ns}.${sub}`)) misses.push(`${f}: ${ns}.${sub}`);
    }
  }
  assert.deepEqual(misses, [], "add these subtrees to CLIENT_MESSAGE_SUBTREES");
});

test("every listed subtree exists in en.json", () => {
  const picked = pickClientSubtrees(en as Record<string, unknown>) as Record<string, Record<string, unknown>>;
  for (const path of CLIENT_MESSAGE_SUBTREES) {
    const [ns, sub] = path.split(".");
    assert.ok(picked[ns]?.[sub] !== undefined, `${path} is not in en.json`);
  }
});

test("the client payload stays far below the full catalogs", () => {
  const full = JSON.stringify(en).length;
  const client = JSON.stringify(pickClientSubtrees(en as Record<string, unknown>)).length;
  assert.ok(client < full / 5, `client subtrees ${client} bytes vs full ${full}`);
});

test("browser builds alias @/i18n/messages to the catalog-free module", () => {
  const config = readFileSync(join(WEB, "next.config.ts"), "utf8");
  assert.match(config, /"@\/i18n\/messages": \{ browser: "\.\/src\/i18n\/messages\.client\.ts" \}/);
  assert.match(config, /"@\/i18n\/messages\$": path\.resolve\(process\.cwd\(\), "src\/i18n\/messages\.client\.ts"\)/);
  const client = readFileSync(join(WEB, "src/i18n/messages.client.ts"), "utf8");
  assert.doesNotMatch(client, /messages\/(en|es|fr)\.json/);
});
