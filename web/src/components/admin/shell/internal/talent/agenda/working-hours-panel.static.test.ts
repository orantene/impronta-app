import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const internal = join(process.cwd(), "src/components/admin/shell/internal");
const read = (rel: string) => readFileSync(join(internal, rel), "utf8");

test("Working hours opens as ONE shared panel from Settings, Calendar and Today/setup", () => {
  for (const rel of ["talent/pages/SettingsPage.tsx", "talent/pages/TodayPage.tsx"]) {
    const src = read(rel);
    assert.match(src, /openWorkingHoursPanel/, rel);
    assert.doesNotMatch(src, /setTalentPage\("calendar-availability"\)/, rel);
  }
  const router = read("talent.tsx");
  assert.match(router, /onOpenAvailability=\{openWorkingHoursPanel\}/);
  assert.match(router, /<WorkingHoursPanelHost \/>/);
  // The full page stays as the fallback route.
  assert.match(router, /case "calendar-availability":/);
});

test("the panel is a drawer on desktop and a bottom sheet on a phone, and closes after a real save", () => {
  const panel = read("talent/agenda/WorkingHoursPanel.tsx");
  assert.match(panel, /max-md:bottom-0/);
  assert.match(panel, /md:right-0/);
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /onSaved=/);
  const page = read("talent/agenda/AgendaAvailabilityPage.tsx");
  // onSaved fires only on the ok branch of saveBookingHours.
  assert.match(page, /Availability saved\.[^]*onSaved\?\.\(\)/);
});

test("Calendar header reads Bookings with List and Working hours buttons (calendar_d)", () => {
  const cal = read("talent/agenda/AgendaCalendarPage.tsx");
  assert.match(cal, /title=\{copy\.t\("Bookings"\)\}/);
  assert.match(cal, /copy\.t\("List"\)/);
  assert.match(cal, /copy\.t\("Working hours"\)/);
});
