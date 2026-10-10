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

test("TUL-358: Horario panel opens on profile id alone (never week calendar without hours)", () => {
  const panel = read("talent/agenda/WorkingHoursPanel.tsx");
  assert.match(panel, /const eligible = Boolean\(talentProfileId\)/);
  assert.doesNotMatch(panel, /bridgeTalentAgendaV2 && talentProfileId/);
  const router = read("talent.tsx");
  // calendar-availability must prefer AgendaAvailabilityPage when a profile id exists.
  assert.match(
    router,
    /case "calendar-availability":[\s\S]*?bridgeTalentSelfProfile\?\.id[\s\S]*?AgendaAvailabilityPage/,
  );
  assert.doesNotMatch(
    router,
    /case "calendar-availability":[\s\S]*?agendaV2 && bridgeTalentSelfProfile/,
  );
  // Legacy Calendar Disponibilidad CTA opens the hours panel, not block-dates.
  const legacyCal = read("talent/pages/CalendarPage.tsx");
  assert.match(legacyCal, /openWorkingHoursPanel/);
  assert.doesNotMatch(legacyCal, /openDrawer\("talent-block-dates"\)/);
  // Zona horaria control lives on the hours form the panel embeds (TUL-536).
  const hours = read("talent/agenda/AgendaAvailabilityPage.tsx");
  assert.match(hours, /TimezonePicker/);
  assert.match(panel, /AgendaAvailabilityPage/);
});

test("live2b-01: seeded bridge hours keep closed days closed (no fake Mon–Sat open)", () => {
  const page = read("talent/agenda/AgendaAvailabilityPage.tsx");
  assert.match(page, /open: seeded \? false : idx >= 1 && idx <= 6/);
  assert.doesNotMatch(
    page,
    /return \{\s*day: idx,\s*label,\s*open: idx >= 1 && idx <= 6/,
  );
});

test("the panel is a drawer on desktop and a bottom sheet on a phone, and closes after a real save", () => {
  const panel = read("talent/agenda/WorkingHoursPanel.tsx");
  assert.match(read("talent/agenda/AgendaPanelFrame.tsx"), /role="dialog"/);
  assert.match(panel, /AgendaPanelFrame/);
  assert.match(panel, /onSaved=/);
  const page = read("talent/agenda/AgendaAvailabilityPage.tsx");
  // onSaved fires only on the ok branch of saveBookingHours.
  assert.match(page, /Availability saved\.[^]*onSaved\?\.\(\)/);
});

test("New booking opens as the same drawer / bottom sheet from Today and Calendar, route kept", () => {
  const today = read("talent/pages/TodayPage.tsx");
  assert.match(today, /onNewBooking=\{openNewBookingPanel\}/);
  const router = read("talent.tsx");
  assert.match(router, /onNewBooking=\{openNewBookingPanel\}/);
  assert.match(router, /<NewBookingPanelHost/);
  assert.match(router, /case "bookings-new":/);
  const frame = read("talent/agenda/AgendaPanelFrame.tsx");
  assert.match(frame, /max-md:bottom-0/);
  assert.match(frame, /md:right-0/);
  const panel = read("talent/agenda/NewBookingPanel.tsx");
  assert.match(panel, /AgendaPanelFrame/);
  assert.match(panel, /embedded/);
  // Success only after the writer: toast and close live in onSaved / onOpenRecord.
  // F63: the toast (with View booking) comes first, then the panel closes and the agenda refreshes.
  assert.match(panel, /onSaved=\{\(id\) => \{[^]*toast\(\s*copy\.t\("Booking saved"\)[^]*store\.close\(\);\s*router\.refresh\(\)/);
  assert.match(panel, /copy\.t\("View booking"\)/);
  assert.match(read("talent/agenda/AgendaNewBooking.tsx"), /embedded \? "grid gap-4"/);
});

test("Calendar header reads Bookings with List and Working hours buttons (calendar_d)", () => {
  const cal = read("talent/agenda/AgendaCalendarPage.tsx");
  assert.match(cal, /title=\{copy\.t\("Bookings"\)\}/);
  assert.match(cal, /copy\.t\("List"\)/);
  assert.match(cal, /copy\.t\("Working hours"\)/);
});
