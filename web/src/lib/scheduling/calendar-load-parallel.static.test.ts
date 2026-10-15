import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// TUL-700: the workspace Calendar sat on "Reading the day..." for an empty
// workspace. These pin the shape of the three reads behind that screen:
// independent reads overlap, and the board paints without waiting for the
// schedule.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");
const appts = read("./appointments-actions.ts");
const sched = read("../sessions/schedule-actions.ts");
const board = read("../../components/admin/shell/internal/page-modules/CalendarResources.tsx");

test("loadAppointments reads the zone and both booking lists in ONE wave", () => {
  const body = appts.slice(
    appts.indexOf("export async function loadAppointments"),
    appts.indexOf("const todayYmd = utcToZonedYmd"),
  );
  assert.doesNotMatch(body, /await resolveTenantTimezone/, "zone must not be its own sequential await");
  assert.match(body, /Promise\.all\(\[\s*resolveTenantTimezone\(tenantId\)/);
});

test("loadSchedule reads series, sessions and venues in ONE wave", () => {
  const body = sched.slice(
    sched.indexOf("export async function loadSchedule"),
    sched.indexOf("const sessions = sessionRows"),
  );
  assert.match(body, /Promise\.all\(\[/);
  for (const t of ['"session_series"', '"sessions"', '"venues"']) {
    assert.ok(body.includes(`.from(${t})`), `${t} read is in the wave`);
  }
  assert.doesNotMatch(body, /await admin\s*\.from\("session_series"\)/, "series is not its own await");
});

test("the Resources board does not wait for the schedule to paint", () => {
  assert.doesNotMatch(board, /Promise\.all\(\[\s*loadAppointments/, "board and schedule are separate chains");
  assert.match(board, /loadAppointments\(tenantId\)\s*\.then/);
  assert.match(board, /loadSchedule\(tenantId\)\s*\.then/);
});
