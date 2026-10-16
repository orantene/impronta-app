/**
 * TUL-701: /admin/sessions took 25-30 s on "Cargando las citas...".
 *
 * Root cause: the screen fired FIVE separate server actions. Next runs one
 * client's server actions one at a time, so the Promise.all was a queue, and
 * every action paid its own guard (session, workspace scope, membership,
 * capability) and its own chain of awaited reads. The tables are tiny, so the
 * time was never the data: it was trips, multiplied by five.
 *
 * Source scans, because the page is a client module and the actions need a
 * request to run.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const read = (p: string) => readFileSync(join(WEB, p), "utf8");
const PAGE = "src/components/admin/shell/internal/page-modules/AppointmentsPage.tsx";

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
    .join("\n");
}

test("the page makes ONE server-action call for the whole surface", () => {
  const src = codeOnly(read(PAGE));
  assert.match(src, /loadAppointmentsSurface\(/);
  for (const name of ["loadAppointments", "loadSchedule", "loadSessionWaitlists", "loadBookingHoursProposals"]) {
    assert.ok(!new RegExp(`\\b${name}\\(`).test(src), `${name} is still called from the page: a queued server action`);
  }
});

test("the surface action runs its reads in parallel behind one guard", () => {
  const src = codeOnly(read("src/lib/scheduling/appointments-surface-action.ts"));
  assert.match(src, /^"use server"/m);
  assert.match(src, /Promise\.all\(\[\s*loadAppointments\(/);
  assert.match(src, /loadSchedule\(/);
  assert.match(src, /loadSessionWaitlists\(/);
  assert.match(src, /loadBookingHoursProposals\(/);
});

test("the staff guard runs once per request however many loaders ask", () => {
  const guard = codeOnly(read("src/lib/saas/admin-scope.ts"));
  assert.match(guard, /requireWorkspaceStaffActionOnce\s*=\s*cache\(/);
  for (const f of ["src/lib/scheduling/appointments-actions.ts", "src/lib/sessions/schedule-actions.ts"]) {
    const s = codeOnly(read(f));
    assert.match(s, /requireWorkspaceStaffActionOnce\(\)/, `${f} does not use the once-per-request guard in its loader`);
  }
});

test("the timezone read overlaps the bookings read instead of preceding it", () => {
  const src = codeOnly(read("src/lib/scheduling/appointments-actions.ts"));
  assert.match(src, /const zonePromise = resolveTenantTimezone\(tenantId\)/);
  assert.ok(!/const \{ timezone: tenantZone \} = await resolveTenantTimezone/.test(src));
  assert.match(src, /Promise\.all\(\[\s*servingNamesByInquiry\(/, "serving names and places are read one after the other");
});

test("the page gives up with a readable ES/EN message instead of spinning forever", () => {
  const src = codeOnly(read(PAGE));
  assert.match(src, /setTimeout\(/);
  assert.match(src, /loadTimeout/);
  for (const l of ["en", "es"]) {
    const m = JSON.parse(read(`messages/${l}.json`));
    const s = m.dashboard.adminAppointments.loadTimeout;
    assert.ok(typeof s === "string" && s.length > 10, `${l} loadTimeout copy missing`);
    assert.ok(!s.includes("—"), "no em dashes");
  }
});
