import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "src");

test("open_studio provision copies offerings/hours after self roster (TUL-453)", () => {
  const src = readFileSync(
    join(root, "lib/server-actions/talent-workspace-provision.ts"),
    "utf8",
  );
  assert.match(src, /copyMyselfOfferingsAndHoursToWorkspace/);
  const rosterAt = src.indexOf("ensureSelfRosterSiteVisible");
  const copyAt = src.indexOf("copyMyselfOfferingsAndHoursToWorkspace(admin");
  assert.ok(rosterAt >= 0 && copyAt > rosterAt, "copy must run after self roster");
});

test("myself→both hours rehome uses T1-07 allow-listed writer (no direct update)", () => {
  const src = readFileSync(
    join(root, "lib/onboarding/myself-both-workspace-copy.server.ts"),
    "utf8",
  );
  assert.match(src, /rehomeBookingHoursTenant/);
  // Reads are fine; mutating calls must not sit next to the table literal.
  const re = /"talent_booking_hours"(?!_)/g;
  for (const m of src.matchAll(re)) {
    const window = src.slice((m.index ?? 0) + m[0].length, (m.index ?? 0) + m[0].length + 200);
    assert.ok(
      !/\.\s*(insert|upsert|update)\s*\(/.test(window),
      "myself-both-workspace-copy.server.ts must not write talent_booking_hours directly",
    );
  }
});

test("no TUL-453 backfill migration ships (PM: code path only)", () => {
  // Migration was stripped: data backfill doesn't belong in schema migrations,
  // target rule was too wide, and prod had 0 matching rows. Code path alone.
  const migDir = join(process.cwd(), "../supabase/migrations");
  const hits = readdirSync(migDir).filter((f) => /tul453/i.test(f));
  assert.deepEqual(hits, [], `unexpected TUL-453 migration(s): ${hits.join(", ")}`);
});
