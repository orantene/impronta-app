import assert from "node:assert/strict";
import test from "node:test";

import {
  appointmentsTimezoneMissing,
  hasOpeningHours,
  parseArgs,
  pickTimezone,
  planStudioAppointmentsBackfill,
  runBackfill,
  type AgencyCandidate,
  type BackfillIo,
} from "./backfill-studio-appointments-timezone";

const hours = {
  "0": [],
  "1": [{ startMin: 540, endMin: 1080 }],
  "2": [{ startMin: 540, endMin: 1080 }],
  "3": [{ startMin: 540, endMin: 1080 }],
  "4": [{ startMin: 540, endMin: 1080 }],
  "5": [{ startMin: 540, endMin: 1080 }],
  "6": [{ startMin: 540, endMin: 1080 }],
};

test("guards: needs opening_hours and missing/invalid appointments.timezone", () => {
  assert.equal(hasOpeningHours({ opening_hours: hours }), true);
  assert.equal(hasOpeningHours({}), false);
  assert.equal(appointmentsTimezoneMissing(null), true);
  assert.equal(appointmentsTimezoneMissing({}), true);
  assert.equal(appointmentsTimezoneMissing({ appointments: null }), true);
  assert.equal(appointmentsTimezoneMissing({ appointments: { timezone: "not/a/zone" } }), true);
  assert.equal(appointmentsTimezoneMissing({ appointments: { timezone: "America/Mexico_City" } }), false);
});

test("pickTimezone prefers agency column, then roster hours", () => {
  assert.deepEqual(pickTimezone({ agencyTimezone: "America/Cancun", rosterTimezones: ["Europe/Madrid"] }), {
    timezone: "America/Cancun",
    source: "agency_column",
  });
  assert.deepEqual(pickTimezone({ agencyTimezone: null, rosterTimezones: [null, "Europe/Madrid"] }), {
    timezone: "Europe/Madrid",
    source: "roster_hours",
  });
  assert.equal(pickTimezone({ agencyTimezone: "bogus", rosterTimezones: [] }), null);
});

test("plan: apply when hours present and appointments null", () => {
  const agency: AgencyCandidate = {
    id: "a1",
    slug: "fresh-studio",
    timezone: null,
    settings: { opening_hours: hours, business_place: { mode: "studio", area: "Centro" } },
  };
  const plan = planStudioAppointmentsBackfill(agency, ["America/Mexico_City"]);
  assert.equal(plan.status, "apply");
  if (plan.status !== "apply") return;
  assert.equal(plan.timezone, "America/Mexico_City");
  assert.equal(plan.timezoneSource, "roster_hours");
  const appt = plan.nextSettings.appointments as { enabled: boolean; timezone: string; presetId: string };
  assert.equal(appt.enabled, true);
  assert.equal(appt.timezone, "America/Mexico_City");
  assert.equal(appt.presetId, "salon");
  assert.ok(plan.nextSettings.opening_hours, "opening_hours preserved");
  assert.ok(plan.nextSettings.business_place, "business_place preserved");
});

test("plan: skip when timezone already valid", () => {
  const plan = planStudioAppointmentsBackfill(
    {
      id: "a1",
      slug: "ok",
      timezone: "America/Cancun",
      settings: { opening_hours: hours, appointments: { enabled: true, timezone: "America/Cancun" } },
    },
    [],
  );
  assert.equal(plan.status, "skipped");
  if (plan.status === "skipped") assert.match(plan.reason, /already valid/);
});

test("plan: skip with no timezone source (no invented default)", () => {
  const plan = planStudioAppointmentsBackfill(
    { id: "a1", slug: "orphan", timezone: null, settings: { opening_hours: hours } },
    [null, ""],
  );
  assert.equal(plan.status, "skipped");
  if (plan.status === "skipped") assert.equal(plan.reason, "no_timezone_source");
});

test("parseArgs: dry-run default, only, restore", () => {
  assert.deepEqual(parseArgs([]), { apply: false, yes: false, only: null, restore: null });
  assert.deepEqual(parseArgs(["--apply", "--yes", "--only=a,b"]), {
    apply: true,
    yes: true,
    only: ["a", "b"],
    restore: null,
  });
  assert.equal(parseArgs(["--restore=/tmp/x.json"]).restore, "/tmp/x.json");
});

test("runBackfill dry-run writes nothing; apply --yes writes + backups", async () => {
  const writes: Array<{ id: string; settings: Record<string, unknown> }> = [];
  const backups: unknown[] = [];
  const io: BackfillIo = {
    async listCandidates() {
      return [
        {
          id: "a1",
          slug: "studio-a",
          timezone: "America/Mexico_City",
          settings: { opening_hours: hours },
        },
        {
          id: "a2",
          slug: "studio-b",
          timezone: null,
          settings: { opening_hours: hours, appointments: { timezone: "America/Cancun", enabled: true } },
        },
      ];
    },
    async rosterTimezones() {
      return [];
    },
    async writeSettings(id, settings) {
      writes.push({ id, settings });
    },
    writeBackup(_label, data) {
      backups.push(data);
      return "/tmp/fake-backup.json";
    },
    readBackup() {
      return [];
    },
  };

  const dry = await runBackfill(io, { apply: false, yes: false, only: null, restore: null });
  assert.equal(dry.apply, 1);
  assert.equal(dry.skipped, 1);
  assert.equal(dry.wrote, 0);
  assert.equal(writes.length, 0);

  const live = await runBackfill(io, { apply: true, yes: true, only: null, restore: null });
  assert.equal(live.wrote, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]!.id, "a1");
  assert.equal((writes[0]!.settings.appointments as { timezone: string }).timezone, "America/Mexico_City");
  assert.equal(backups.length, 1);
});
