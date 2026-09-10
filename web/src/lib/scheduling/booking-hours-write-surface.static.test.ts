/**
 * INVARIANT (T1-07) — talent_booking_hours has exactly ONE application-level
 * writer: `src/lib/server-actions/booking-hours.ts` (a human, owner or staff,
 * saving their own calendar through saveBookingHours). Everything else
 * proposes: `propose-default-booking-hours.ts` writes to the sibling
 * `talent_booking_hours_proposals` table, and the only other writer of
 * `talent_booking_hours` is the database function
 * `accept_booking_hours_proposal`, which is SQL, not TypeScript, and so
 * cannot show up in this grep by construction.
 *
 * THE DEFECT THIS GUARDS AGAINST: a second insert/update/upsert call site
 * against `talent_booking_hours` reappearing under src/lib — the exact shape
 * of the bug this task fixed (`ensure-default-booking-hours.ts` used to
 * insert real hours on every publish, no review, defaulting the timezone to
 * UTC).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const LIB = path.join(process.cwd(), "src", "lib");
const ALLOWED_WRITERS = new Set([path.join(LIB, "server-actions", "booking-hours.ts")]);

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = path.join(dir, entry);
    const stat = statSync(p);
    if (stat.isDirectory()) walk(p, out);
    else if (p.endsWith(".ts") || p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * True when the file calls insert/update/upsert against `talent_booking_hours`
 * (never `talent_booking_hours_proposals`, a different table). Covers both
 * `.from("talent_booking_hours").insert(...)` and the tenant-scoped-query
 * helper `tenantScopedQuery(admin, "talent_booking_hours", tenantId).upsert(...)`
 * by looking for a mutating call within a short window after the literal.
 */
function writesBookingHours(src: string): boolean {
  const re = /"talent_booking_hours"(?!_)/g;
  for (const m of src.matchAll(re)) {
    const start = (m.index ?? 0) + m[0].length;
    const window = src.slice(start, start + 200);
    if (/\.\s*(insert|upsert|update)\s*\(/.test(window)) return true;
  }
  return false;
}

test("only the booking-hours module writes talent_booking_hours under src/lib", () => {
  const writers = walk(LIB)
    .filter((file) => !file.endsWith(".test.ts"))
    .filter((file) => writesBookingHours(readFileSync(file, "utf8")));

  // Positive control: if the allowed writer stops matching, the regex above
  // has drifted from the real call shape and this test would pass for the
  // wrong reason.
  assert.ok(
    writers.some((f) => ALLOWED_WRITERS.has(f)),
    "expected src/lib/server-actions/booking-hours.ts to be detected as a writer " +
      "(positive control) — the detection regex may have drifted",
  );

  const offenders = writers.filter((f) => !ALLOWED_WRITERS.has(f));
  assert.deepEqual(
    offenders,
    [],
    "only src/lib/server-actions/booking-hours.ts may write talent_booking_hours; " +
      `found: ${offenders.join(", ")}`,
  );
});
