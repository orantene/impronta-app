/**
 * TUL-36 slice 3: the read-only availability tool. The public loader's verdict is final,
 * starts are future/capped, nothing is held or booked.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { PublicOpenTimesResult } from "@/lib/scheduling/public-open-times";

import {
  AVAILABILITY_MAX_STARTS,
  availabilityFrom,
  availabilityReplyText,
  formatOfferedTime,
  pickAvailabilityStarts,
  runAvailabilityTool,
  type AvailabilityDeps,
} from "./availability";
import { runAvailabilityForGuest } from "./availability.server";

const now = new Date("2026-11-02T12:00:00.000Z");
const host = { kind: "agency", tenantId: "T1", talentSiteId: null };
const base = { offeringId: "off1", now, host, locale: "en" };

function deps(result: PublicOpenTimesResult, seen: unknown[] = []): AvailabilityDeps {
  return { loadOpenTimes: async (a) => (seen.push(a), result) };
}

test("future starts only, sorted, de-duplicated, capped at 6, with the talent's zone", async () => {
  const slots = [
    "2026-11-02T11:00:00.000Z", // past
    "2026-11-05T15:00:00.000Z", "2026-11-03T15:00:00.000Z", "2026-11-03T15:00:00.000Z",
    "2026-11-03T16:00:00.000Z", "2026-11-03T17:00:00.000Z", "2026-11-03T18:00:00.000Z",
    "2026-11-03T19:00:00.000Z", "2026-11-03T20:00:00.000Z", "bogus",
  ];
  const r = await runAvailabilityTool(base, deps({ ok: true, slots, timezone: "America/Cancun", mode: "instant" }));
  assert.equal(r.kind, "times");
  if (r.kind !== "times") return;
  assert.equal(r.starts.length, AVAILABILITY_MAX_STARTS);
  assert.deepEqual(r.starts.slice(0, 2), ["2026-11-03T15:00:00.000Z", "2026-11-03T16:00:00.000Z"]);
  assert.ok(r.starts.every((s) => Date.parse(s) > now.getTime()));
  assert.equal(r.timezone, "America/Cancun");
});

test("the date hint starts the search only when it is a real later day; the window is 7 days", async () => {
  assert.equal(availabilityFrom("2026-11-10", now).toISOString(), "2026-11-10T00:00:00.000Z");
  assert.equal(availabilityFrom("2026-11-01", now), now);
  assert.equal(availabilityFrom("2026-02-31", now), now);
  assert.equal(availabilityFrom("friday", now), now);
  assert.equal(availabilityFrom(null, now), now);
  const seen: Array<{ days: number; from: Date; offeringId: string }> = [];
  await runAvailabilityTool({ ...base, date: "2026-11-10" }, deps({ ok: true, slots: [] }, seen));
  assert.equal(seen[0]!.days, 7);
  assert.equal(seen[0]!.offeringId, "off1");
  assert.equal(seen[0]!.from.toISOString(), "2026-11-10T00:00:00.000Z");
});

test("the loader's verdict is final: 404 is an unknown service, 500 is unsure, inquiry-only hands off", async () => {
  assert.deepEqual(await runAvailabilityTool(base, deps({ ok: false, status: 404, error: "not_found" })), { kind: "handoff", reason: "unknown_service" });
  assert.deepEqual(await runAvailabilityTool(base, deps({ ok: false, status: 500, error: "query_failed" })), { kind: "handoff", reason: "unsure" });
  assert.deepEqual(await runAvailabilityTool(base, deps({ ok: true, slots: [], reason: "inquiry_only" })), { kind: "handoff", reason: "inquiry_only" });
});

test("no times carries the loader's reason (or none_in_window) and never invents a slot", async () => {
  assert.deepEqual(await runAvailabilityTool(base, deps({ ok: true, slots: [], reason: "no_booking_hours", timezone: "UTC" })), {
    kind: "none", reason: "no_booking_hours", timezone: "UTC",
  });
  assert.deepEqual(await runAvailabilityTool(base, deps({ ok: true, slots: ["2026-11-01T10:00:00.000Z"] })), {
    kind: "none", reason: "none_in_window", timezone: null,
  });
});

test("reply text: ES and EN, in the talent's zone, no em dash", () => {
  const r = { kind: "times" as const, starts: ["2026-11-03T15:00:00.000Z"], timezone: "America/Cancun", mode: "instant" };
  const en = availabilityReplyText(r, "en");
  const es = availabilityReplyText(r, "es");
  assert.match(en, /^These times are open: .*10:00/);
  assert.match(es, /^Estos horarios estan libres: .*10:00/);
  assert.equal(formatOfferedTime("nope", null, "en"), "nope");
  assert.match(availabilityReplyText({ kind: "none", reason: "none_in_window", timezone: null }, "es"), /equipo/);
  assert.match(availabilityReplyText({ kind: "handoff", reason: "unknown_service" }, "en"), /A person on the team/);
  assert.doesNotMatch(en + es, /—/);
  assert.deepEqual(pickAvailabilityStarts([], now), []);
});

test("runAvailabilityForGuest uses the injected loader and returns result + reply", async () => {
  const out = await runAvailabilityForGuest({} as SupabaseClient, base, deps({ ok: true, slots: ["2026-11-03T15:00:00.000Z"], timezone: "UTC", mode: "request" }));
  assert.equal(out.result.kind, "times");
  assert.match(out.reply, /open/);
});

test("static: read-only (no writer, no hold, no money) and the real loader is the public one", () => {
  const dir = join(process.cwd(), "src/lib/ai/booking-assistant/tools");
  for (const f of ["availability.ts", "availability.server.ts"]) {
    const src = readFileSync(join(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.doesNotMatch(src, /createPurchase|createPaymentLink|stripe|placeReservationHold|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/i, f);
  }
  assert.match(readFileSync(join(dir, "availability.server.ts"), "utf8"), /loadPublicOpenTimes\(admin/);
});
