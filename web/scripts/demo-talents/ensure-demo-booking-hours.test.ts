/**
 * TUL-516 / TUL-489: ensure-demo-booking-hours pure planner tests.
 *
 *   cd web && npx tsx --test scripts/demo-talents/ensure-demo-booking-hours.test.ts
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import type { DemoHoursSpec } from "../../src/lib/talent-site/demos/demo-booking-hours";
import {
  FORBIDDEN_PROFILE_CODES,
  TARGETS,
  hoursFromRow,
  parseArgs,
  run,
  selectTargets,
  weeklyFromHours,
  type HoursRow,
  type Io,
  type ProfileRow,
} from "./ensure-demo-booking-hours";

const DIEGO = "TAL-93005";
const DIEGO_SLUG = "diego-navarro-dj";

function profile(code: string, over: Partial<ProfileRow> = {}): ProfileRow {
  return { id: `id-${code}`, profile_code: code, is_demo: true, ...over };
}

function diegoHours(): DemoHoursSpec {
  return {
    timezone: "America/Monterrey",
    days: [4, 5, 6, 0],
    startMin: 16 * 60,
    endMin: 23 * 60,
    slotMinutes: 60,
  };
}

function fakeDb(opts?: {
  noDiegoHours?: boolean;
  narrowDiego?: boolean;
  missingDiego?: boolean;
}): {
  profiles: Record<string, ProfileRow>;
  slugs: Record<string, string | null>;
  hours: Record<string, HoursRow>;
} {
  const profiles: Record<string, ProfileRow> = {};
  const slugs: Record<string, string | null> = {};
  const hours: Record<string, HoursRow> = {};
  for (const t of TARGETS) {
    if (opts?.missingDiego && t.profileCode === DIEGO) continue;
    profiles[t.profileCode] = profile(t.profileCode);
    slugs[`id-${t.profileCode}`] = t.siteSlug;
    if (t.profileCode === DIEGO) {
      if (opts?.noDiegoHours) hours[`id-${DIEGO}`] = null;
      else if (opts?.narrowDiego) {
        hours[`id-${DIEGO}`] = {
          timezone: "America/Monterrey",
          weekly: weeklyFromHours({
            timezone: "America/Monterrey",
            days: [5, 6],
            startMin: 18 * 60,
            endMin: 20 * 60,
            slotMinutes: 60,
          }),
          slot_minutes: 60,
          horizon_days: 60,
        };
      } else {
        const h = diegoHours();
        hours[`id-${DIEGO}`] = {
          timezone: h.timezone,
          weekly: weeklyFromHours(h),
          slot_minutes: h.slotMinutes,
          horizon_days: 60,
        };
      }
    } else {
      // Other targets: invent a wide Mon–Sat window so they are "already fit".
      const wide: DemoHoursSpec = {
        timezone: "America/Mexico_City",
        days: [1, 2, 3, 4, 5, 6],
        startMin: 8 * 60,
        endMin: 22 * 60,
        slotMinutes: 60,
      };
      hours[`id-${t.profileCode}`] = {
        timezone: wide.timezone,
        weekly: weeklyFromHours(wide),
        slot_minutes: 60,
        horizon_days: 60,
      };
    }
  }
  return { profiles, slugs, hours };
}

function fakeIo(db: ReturnType<typeof fakeDb>): {
  io: Io;
  writes: Array<{ profileId: string; hours: DemoHoursSpec }>;
  backups: unknown[];
} {
  const writes: Array<{ profileId: string; hours: DemoHoursSpec }> = [];
  const backups: unknown[] = [];
  let stored: unknown = null;
  const io: Io = {
    async findProfile(code) {
      return db.profiles[code] ?? null;
    },
    async findSiteSlug(id) {
      return db.slugs[id] ?? null;
    },
    async readHours(id) {
      return db.hours[id] ?? null;
    },
    async hubTenantId() {
      return "hub-1";
    },
    async upsertHours(profileId, _tenantId, hours) {
      writes.push({ profileId, hours });
      db.hours[profileId] = {
        timezone: hours.timezone,
        weekly: weeklyFromHours(hours),
        slot_minutes: hours.slotMinutes,
        horizon_days: 60,
      };
      return { ok: true };
    },
    writeBackup(data) {
      stored = JSON.parse(JSON.stringify(data));
      backups.push(stored);
      return "/tmp/b.json";
    },
    readBackup() {
      return stored;
    },
  };
  return { io, writes, backups };
}

test("TARGETS include Diego and exclude forbidden codes", () => {
  assert.ok(TARGETS.some((t) => t.profileCode === DIEGO && t.siteSlug === DIEGO_SLUG));
  for (const code of FORBIDDEN_PROFILE_CODES) {
    assert.ok(!TARGETS.some((t) => t.profileCode === code));
  }
});

test("parseArgs / selectTargets refuse forbidden and off-list codes", () => {
  assert.deepEqual(parseArgs([]), { apply: false, yes: false, only: [], restore: null });
  assert.throws(() => selectTargets(["TAL-93938"]), /refusing/);
  assert.throws(() => selectTargets(["TAL-90000"]), /not on the allow-list/);
  const only = selectTargets([DIEGO]);
  assert.equal(only.length, 1);
  assert.equal(only[0]!.profileCode, DIEGO);
});

test("hoursFromRow / weeklyFromHours round-trip", () => {
  const h = diegoHours();
  const row: HoursRow = {
    timezone: h.timezone,
    weekly: weeklyFromHours(h),
    slot_minutes: h.slotMinutes,
    horizon_days: 60,
  };
  const back = hoursFromRow(row);
  assert.ok(back);
  assert.equal(back!.timezone, h.timezone);
  assert.deepEqual(back!.days.sort(), [...h.days].sort());
  assert.equal(back!.startMin, h.startMin);
  assert.equal(back!.endMin, h.endMin);
});

test("dry run writes nothing and names Diego", async () => {
  const db = fakeDb({ noDiegoHours: true });
  const { io, writes } = fakeIo(db);
  const r = await run(["--only", DIEGO], io);
  assert.equal(r.exitCode, 0);
  assert.equal(writes.length, 0);
  assert.ok(r.lines.some((l) => l.startsWith(`${DIEGO} id=id-${DIEGO} site=${DIEGO_SLUG}`)));
  assert.ok(r.lines.some((l) => /Dry run/.test(l)));
});

test("--apply without --yes is refused", async () => {
  const { io, writes } = fakeIo(fakeDb({ noDiegoHours: true }));
  const r = await run(["--only", DIEGO, "--apply"], io);
  assert.equal(r.exitCode, 2);
  assert.equal(writes.length, 0);
});

test("apply creates Diego hours that fit 300m; second run is idempotent", async () => {
  const db = fakeDb({ noDiegoHours: true });
  const { io, writes, backups } = fakeIo(db);
  const r = await run(["--only", DIEGO, "--apply", "--yes"], io);
  assert.equal(r.exitCode, 0);
  assert.equal(backups.length, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0]!.profileId, `id-${DIEGO}`);
  assert.equal(writes[0]!.hours.timezone, "America/Monterrey");
  assert.ok(writes[0]!.hours.endMin - writes[0]!.hours.startMin >= 300);

  const again = await run(["--only", DIEGO, "--apply", "--yes"], io);
  assert.equal(again.exitCode, 0);
  assert.equal(writes.length, 1); // no second write
});

test("narrow Diego window is widened", async () => {
  const db = fakeDb({ narrowDiego: true });
  const { io, writes } = fakeIo(db);
  const r = await run(["--only", DIEGO, "--apply", "--yes"], io);
  assert.equal(r.exitCode, 0);
  assert.equal(writes.length, 1);
  assert.ok(writes[0]!.hours.endMin - writes[0]!.hours.startMin >= 360);
});

test("refuses real/test talents, non-demo, and slug mismatch", async () => {
  for (const code of ["TAL-93938", "TAL-93900", "TAL-90000"]) {
    const { io, writes } = fakeIo(fakeDb());
    const r = await run(["--only", code, "--apply", "--yes"], io);
    assert.equal(r.exitCode, 2, code);
    assert.equal(writes.length, 0);
  }

  const notDemo = fakeDb({ noDiegoHours: true });
  notDemo.profiles[DIEGO]!.is_demo = false;
  const a = fakeIo(notDemo);
  assert.equal((await run(["--only", DIEGO, "--apply", "--yes"], a.io)).exitCode, 2);
  assert.equal(a.writes.length, 0);

  const wrongSlug = fakeDb({ noDiegoHours: true });
  wrongSlug.slugs[`id-${DIEGO}`] = "someone-else";
  const b = fakeIo(wrongSlug);
  assert.equal((await run(["--only", DIEGO, "--apply", "--yes"], b.io)).exitCode, 2);
  assert.equal(b.writes.length, 0);
});

test("--restore puts prior hours back (null before = skip delete)", async () => {
  const db = fakeDb({ noDiegoHours: true });
  const { io } = fakeIo(db);
  await run(["--only", DIEGO, "--apply", "--yes"], io);
  assert.ok(db.hours[`id-${DIEGO}`]);

  const refused = await run(["--restore", "/tmp/b.json"], io);
  assert.equal(refused.exitCode, 2);

  // Backup recorded before=null; restore skips delete (manual).
  const r = await run(["--restore", "/tmp/b.json", "--apply", "--yes"], io);
  assert.equal(r.exitCode, 0);
  assert.ok(r.lines.some((l) => /restore skipped/.test(l)));
  assert.ok(db.hours[`id-${DIEGO}`]);
});
