/**
 * TUL-538 — bridged Disponibilidad exposes a real accepting_bookings switch,
 * and Today can turn it on in one click from the banner.
 *
 *   cd web && npx tsx --test src/components/admin/shell/internal/talent/availability-accepting.static.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const root = join(process.cwd(), "src/components/admin/shell/internal");

test("bridged Disponibilidad drawer wires accepting_bookings (not blocks-only)", () => {
  const src = readFileSync(join(root, "talent-drawers/availability.tsx"), "utf8");
  assert.match(src, /setTalentAcceptingBookingsAction/);
  assert.match(src, /isBridged && \(/);
  assert.match(src, /Taking new bookings/);
  assert.match(src, /acceptingBookings/);
  // Must not keep the old "bridged = blocks only" comment as the sole path.
  assert.match(src, /TUL-538/);
});

test("Today banner 1-clicks accepting_bookings when paused", () => {
  const today = readFileSync(join(root, "talent/pages/TodayPage.tsx"), "utf8");
  const hero = readFileSync(join(root, "talent/shared/today-2.tsx"), "utf8");
  assert.match(today, /setTalentAcceptingBookingsAction\(true\)/);
  assert.match(today, /onActivateAvailability/);
  assert.match(hero, /Turn on availability/);
  assert.match(hero, /onActivateAvailability/);
});

test("fresh bridged profile uses acceptingBookings (not hardcoded false)", () => {
  const fixtures = readFileSync(join(root, "state/fixtures.ts"), "utf8");
  assert.match(fixtures, /availableForWork: bridge\.acceptingBookings !== false/);
  assert.doesNotMatch(
    fixtures,
    /availableForWork: false,\s*\n\s*availableToTravel: false/,
  );
});
