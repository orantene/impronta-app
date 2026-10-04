/**
 * T9.1 — no trade-specific branching in Agenda UI components.
 * Trade behavior must come from TRADE_PROFILES / section renderers.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const AGENDA_DIR = join(
  process.cwd(),
  "src/components/admin/shell/internal/talent/agenda",
);

const FORBIDDEN = [
  /trade\s*===\s*["']beauty["']/,
  /trade\s*===\s*["']barber["']/,
  /trade\s*===\s*["']chef["']/,
  /trade\s*===\s*["']dancer["']/,
  /trade\s*===\s*["']design["']/,
  /primaryTypeLabel\s*===\s*["']Beauty["']/,
  /if\s*\(\s*trade\s*===/,
  /switch\s*\(\s*trade\s*\)/,
];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx|ts)$/.test(name) && !name.includes(".test.")) out.push(p);
  }
  return out;
}

describe("T9.1 no trade-specific if in Agenda components", () => {
  it("agenda UI files avoid hard-coded trade identity branches", () => {
    const files = walk(AGENDA_DIR);
    assert.ok(files.length > 5, "expected agenda component files");
    const hits: string[] = [];
    for (const file of files) {
      const src = readFileSync(file, "utf8");
      for (const re of FORBIDDEN) {
        if (re.test(src)) hits.push(`${file.replace(process.cwd() + "/", "")} ~ ${re}`);
      }
    }
    assert.deepEqual(hits, [], hits.join("\n"));
  });
});
