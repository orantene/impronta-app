import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import { join } from "node:path";

import {
  CAPACITY_HOLD_TTL_MAX_SECONDS,
  CAPACITY_HOLD_TTL_MIN_SECONDS,
  clampToEngineHoldTtl,
} from "./hold-ttl-bounds";

/**
 * The constants must equal the DATABASE's numbers. If the CHECK moves and these
 * do not, this fails — rather than a customer's reserve failing with CP007
 * after the order, the charge and the hold have all been accepted.
 */
const MIGRATIONS = join(process.cwd(), "..", "supabase", "migrations");

function migrationSources(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS, f), "utf8"));
}

test("the constants match every hold_ttl_seconds bound in the migrations", () => {
  const bounds: Array<[number, number]> = [];
  for (const sql of migrationSources()) {
    for (const m of sql.matchAll(/hold_ttl_seconds\s+BETWEEN\s+(\d+)\s+AND\s+(\d+)/gi)) {
      bounds.push([Number(m[1]), Number(m[2])]);
    }
    for (const m of sql.matchAll(/v_ttl\s*<\s*(\d+)\s*OR\s*v_ttl\s*>\s*(\d+)/gi)) {
      bounds.push([Number(m[1]), Number(m[2])]);
    }
  }
  // Vacuity guard: a rename would leave this finding nothing and passing.
  assert.ok(bounds.length >= 2, `expected the CHECK and the function guard, found ${bounds.length}`);
  for (const [lo, hi] of bounds) {
    assert.equal(lo, CAPACITY_HOLD_TTL_MIN_SECONDS, `a migration floors at ${lo}`);
    assert.equal(hi, CAPACITY_HOLD_TTL_MAX_SECONDS, `a migration caps at ${hi}`);
  }
});

test("clamping never widens the engine's bound, whatever a product asks for", () => {
  assert.equal(clampToEngineHoldTtl(30 * 24 * 3600), CAPACITY_HOLD_TTL_MAX_SECONDS);
  // A product limit TIGHTENS; it cannot loosen.
  assert.equal(clampToEngineHoldTtl(999999, 3600), 3600);
  assert.equal(clampToEngineHoldTtl(999999, 30 * 24 * 3600), CAPACITY_HOLD_TTL_MAX_SECONDS);
});

test("below the floor clamps up, so a hold is never shorter than the engine allows", () => {
  assert.equal(clampToEngineHoldTtl(5), CAPACITY_HOLD_TTL_MIN_SECONDS);
});


test("nothing outside this module restates the engine's bounds", () => {
  // The durable half. The 30-day drift was ONE instance; three files carrying
  // the same literal is the class. `reservation-hold.ts` even asserted in a
  // comment that its copies "cannot disagree" — an invariant nothing enforced,
  // true only while a human remembered.
  //
  // Pinned as a SHAPE: a bare 604800 or a `= 30` TTL constant anywhere but here
  // is a second source, whatever it is called.
  const roots = ["src/lib", "src/app"];
  const offenders: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.tsx?$/.test(e.name) || /\.test\.tsx?$/.test(e.name)) continue;
      if (p.endsWith("hold-ttl-bounds.ts")) continue;
      const body = blankComments(readFileSync(p, "utf8"));
      if (/\b604800\b/.test(body)) offenders.push(p.split("/src/")[1] ?? p);
    }
  };
  for (const r of roots) walk(join(process.cwd(), r));
  assert.deepEqual(
    offenders,
    [],
    "these restate the engine's hold cap; import CAPACITY_HOLD_TTL_MAX_SECONDS instead",
  );
});
