import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { readdirSync, statSync } from "node:fs";

import { WEB_ROOT } from "./supabase-unchecked-read";

/**
 * D-MSG-410: `--impronta-gold` is a compatibility alias, NOT a literal gold.
 * It carries dark ink in every neutral context and real gold only inside
 * Impronta's own site themes, so a hardcoded `text-black` on a solid gold
 * background renders black on near-black for every other tenant (seen live on
 * staging-qa-journeys: "Saved to your lineup" was invisible). Anything painting
 * a SOLID gold background must take its label colour from the paired
 * `--impronta-gold-ink`, which every theme block defines beside the gold.
 */
const SOLID_GOLD_WITH_LITERAL_INK = /bg-\[var\(--impronta-gold\)\](?![/\w])[^"'`]*\btext-(black|white)\b/;
const GOLD_DEF = /--impronta-gold:\s*[^;]+;/g;
const INK_DEF = /--impronta-gold-ink:\s*[^;]+;/g;

test("every --impronta-gold definition ships a paired --impronta-gold-ink", () => {
  const css = readFileSync(join(WEB_ROOT, "src/app/globals.css"), "utf8");
  const golds = css.match(GOLD_DEF) ?? [];
  const inks = css.match(INK_DEF) ?? [];
  assert.ok(golds.length > 0, "expected --impronta-gold definitions in globals.css");
  assert.equal(
    inks.length,
    golds.length,
    `each --impronta-gold needs a readable paired ink: ${golds.length} gold vs ${inks.length} ink`,
  );
});

test("no solid --impronta-gold background hardcodes text-black or text-white", () => {
  const offenders: string[] = [];
  const files: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (full.endsWith(".ts") || full.endsWith(".tsx")) files.push(full);
    }
  };
  walk(join(WEB_ROOT, "src"));
  for (const file of files) {
    const body = readFileSync(file, "utf8");
    if (!body.includes("bg-[var(--impronta-gold)]")) continue;
    for (const [index, line] of body.split("\n").entries()) {
      if (SOLID_GOLD_WITH_LITERAL_INK.test(line)) {
        offenders.push(`${file.replace(WEB_ROOT + "/", "")}:${index + 1}`);
      }
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `use text-[var(--impronta-gold-ink)] instead of a literal ink on a solid gold background:\n${offenders.join("\n")}`,
  );
});
