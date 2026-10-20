import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A drawer opened with a REAL id must never fall back to a prototype fixture row
 * (`.find(...) ?? FIXTURE[0]`): a real talent saw "Mango Lookbook", fake contacts and
 * phone numbers as their booking. Source pins; they fail on main, which has the
 * fallbacks in today.tsx, closed-booking.tsx, agency.tsx, drawer-shared.tsx, workspace.tsx.
 */
const root = join(process.cwd(), "src/components/admin/shell/internal");

// Pure UI-config fallbacks (not data about a user): allowed.
const ALLOWED = new Set(["FEATURE_GROUPS", "FOLDER_PALETTE", "TALENT_PAGE_TEMPLATES", "TALENT_FIRST_RUN_STEPS", "CREATE_TYPE_CARDS"]);

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

describe("no fixture fallbacks for real ids", () => {
  it("no `?? FIXTURE[0]` / `|| FIXTURE[0]` outside the UI-config allow-list", () => {
    const bad: string[] = [];
    for (const file of walk(root)) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        const m = line.match(/(\?\?|\|\|)\s*([A-Z][A-Z0-9_]{3,})\[0\]/);
        if (m && !ALLOWED.has(m[2]!)) bad.push(`${file.replace(root, "")}:${i + 1} ${m[2]}`);
      });
    }
    assert.deepEqual(bad, []);
  });

  it("the booking drawer routes a real id to its record page and the others show not-found", () => {
    const today = readFileSync(join(root, "talent-drawers/today.tsx"), "utf8");
    assert.match(today, /\/talent\/bookings\/\$\{encodeURIComponent\(id\)\}/);
    for (const f of ["talent-drawers/today.tsx", "talent-drawers/closed-booking.tsx", "talent-drawers/agency.tsx", "drawers/drawer-shared.tsx", "workspace.tsx"]) {
      assert.match(readFileSync(join(root, f), "utf8"), /RecordNotFoundDrawer/, f);
    }
  });
});
