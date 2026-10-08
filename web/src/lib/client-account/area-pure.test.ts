import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import type { MeRow } from "@/lib/me/shape-me";

import {
  accountAreaGate,
  accountAudience,
  canManageBooking,
  formatZonedWhen,
  groupVisits,
  normalizeAccountSettings,
  parseAccountTab,
  shapeReceiptLines,
} from "./area-pure";

const NOW = Date.parse("2026-10-07T12:00:00Z");
const row = (o: Partial<MeRow> & { id: string }): MeRow => ({
  tenantId: "t1", status: "confirmed", title: "Cut", eventDate: null, eventLocation: null,
  createdAt: "2026-10-01T00:00:00Z", nextActionBy: null, booking: null, ...o,
});

test("visits group into upcoming, waiting on you and past", () => {
  const g = groupVisits(
    [
      row({ id: "a", eventDate: "2026-10-20T10:00:00Z" }),
      row({ id: "b", eventDate: "2026-09-01T10:00:00Z" }),
      row({ id: "c", eventDate: "2026-10-25T10:00:00Z", nextActionBy: "client" }),
      row({ id: "d", eventDate: "2026-10-30T10:00:00Z", status: "cancelled" }),
    ],
    NOW,
  );
  assert.deepEqual(g.upcoming.map((r) => r.id), ["a"]);
  assert.deepEqual(g.waiting.map((r) => r.id), ["c"]);
  assert.deepEqual(g.past.map((r) => r.id).sort(), ["b", "d"]);
});

const open = { bookingTenantId: "t1", bookingClientUserId: "u1", bookingStatus: "confirmed", startsAt: "2026-10-20T10:00:00Z" };
const base = { sessionUserId: "u1", appRole: "client", siteTenantId: "t1", booking: open, nowMs: NOW };

test("canManageBooking: the owner client may", () => {
  assert.deepEqual(canManageBooking(base), { ok: true });
  assert.deepEqual(canManageBooking({ ...base, appRole: null }), { ok: true });
});

test("canManageBooking: another client may not", () => {
  assert.deepEqual(canManageBooking({ ...base, sessionUserId: "u2" }), { ok: false, reason: "not_owner" });
  assert.deepEqual(canManageBooking({ ...base, booking: { ...open, bookingClientUserId: null } }), { ok: false, reason: "not_owner" });
});

test("canManageBooking: talent and staff may not, even on their own id", () => {
  for (const role of ["talent", "agency_staff", "super_admin"]) {
    assert.deepEqual(canManageBooking({ ...base, appRole: role }), { ok: false, reason: "not_client" });
  }
});

test("canManageBooking: signed out and wrong tenant", () => {
  assert.deepEqual(canManageBooking({ ...base, sessionUserId: null }), { ok: false, reason: "not_signed_in" });
  assert.deepEqual(canManageBooking({ ...base, booking: { ...open, bookingTenantId: "t2" } }), { ok: false, reason: "wrong_tenant" });
  assert.deepEqual(canManageBooking({ ...base, siteTenantId: null }), { ok: false, reason: "wrong_tenant" });
});

test("canManageBooking: past and closed bookings", () => {
  assert.deepEqual(canManageBooking({ ...base, booking: { ...open, startsAt: "2026-10-01T10:00:00Z" } }), { ok: false, reason: "past" });
  assert.deepEqual(canManageBooking({ ...base, booking: { ...open, startsAt: null } }), { ok: false, reason: "past" });
  for (const s of ["cancelled", "completed", "archived"]) {
    assert.deepEqual(canManageBooking({ ...base, booking: { ...open, bookingStatus: s } }), { ok: false, reason: "closed" });
  }
});

test("formatZonedWhen shows the talent's zone and names it", () => {
  const w = formatZonedWhen("2026-10-20T16:00:00Z", "America/Mexico_City", "en");
  assert.ok(w);
  assert.match(w.time, /10:00/);
  assert.match(w.tzLabel, /America\/Mexico_City/);
  assert.match(w.date, /October 20, 2026/);
  const es = formatZonedWhen("2026-10-20T16:00:00Z", "America/Mexico_City", "es");
  assert.match(es!.date, /octubre/);
  assert.equal(formatZonedWhen(null, "UTC", "en"), null);
  assert.equal(formatZonedWhen("nope", "UTC", "en"), null);
  assert.match(formatZonedWhen("2026-10-20T16:00:00Z", "Not/AZone", "en")!.tzLabel, /UTC/);
});

test("receipt lines copy ledger amounts and show the Tulala fee on its own line", () => {
  const lines = shapeReceiptLines(
    [
      { code: "service_subtotal", cents: 10000 },
      { code: "platform_fee", cents: 150 },
      { code: "processing_fee", cents: 350 },
      { code: "total_charged", cents: 10500 },
    ],
    10500,
  );
  assert.deepEqual(lines, [
    { kind: "service", cents: 10000 },
    { kind: "tulala_fee", cents: 150 },
    { kind: "processing", cents: 350 },
    { kind: "total", cents: 10500 },
  ]);
});

test("receipt lines that do not add up fall back to the total paid only", () => {
  const bad = [
    { code: "service_subtotal" as const, cents: 10000 },
    { code: "platform_fee" as const, cents: 150 },
    { code: "total_charged" as const, cents: 10500 },
  ];
  assert.deepEqual(shapeReceiptLines(bad, 10500), [{ kind: "total", cents: 10500 }]);
  assert.deepEqual(shapeReceiptLines([], 4200), [{ kind: "total", cents: 4200 }]);
  assert.deepEqual(shapeReceiptLines(null, 4200), [{ kind: "total", cents: 4200 }]);
});

test("route gating: flag off or a non talent host is a 404", () => {
  assert.equal(accountAreaGate({ flagOn: true, hostContext: "talent_site" }), "render");
  assert.equal(accountAreaGate({ flagOn: false, hostContext: "talent_site" }), "not_found");
  for (const h of ["agency", "hub", "app", "marketing", null, undefined]) {
    assert.equal(accountAreaGate({ flagOn: true, hostContext: h }), "not_found");
  }
});

test("audience: signed out, team account, client", () => {
  assert.equal(accountAudience({ userId: null, appRole: "client" }), "signed_out");
  assert.equal(accountAudience({ userId: "u", appRole: "talent" }), "not_client");
  assert.equal(accountAudience({ userId: "u", appRole: "agency_staff" }), "not_client");
  assert.equal(accountAudience({ userId: "u", appRole: "client" }), "client");
});

test("tab and settings parsing", () => {
  assert.equal(parseAccountTab("payments"), "payments");
  assert.equal(parseAccountTab("x"), "visits");
  assert.equal(normalizeAccountSettings({ name: " Ana ", phone: "+52 55 1234 5678", locale: "es", marketingOptIn: true })?.name, "Ana");
  assert.equal(normalizeAccountSettings({ name: "A", phone: "abc", locale: "en" }), null);
  assert.equal(normalizeAccountSettings({ name: "A", phone: "", locale: "fr" }), null);
  assert.equal(normalizeAccountSettings({ name: "A", phone: "", locale: "en" })?.marketingOptIn, false);
});

test("booking actions: engine, tenant from the host, and the pure decision are all wired", () => {
  const src = readFileSync(join(__dirname, "booking-actions.ts"), "utf8");
  assert.match(src, /canManageBooking\(/);
  assert.match(src, /resolveAccountTenant\(\)/);
  assert.match(src, /cancelBookingSet\(/);
  assert.match(src, /rescheduleBooking\(/);
  assert.match(src, /\.eq\("tenant_id", tenant\.tenantId\)/);
  assert.match(src, /accountSurfaceEnabledForRequest\(\)/);
  assert.doesNotMatch(src, /tenantId:\s*(input|parsed\.data)\.tenantId/);
});

test("render entry: flag and host gate run before any data is read", () => {
  const src = readFileSync(join(__dirname, "render-area.tsx"), "utf8");
  assert.ok(src.indexOf("accountAreaGate(") < src.indexOf("loadAccountSite("));
  assert.match(src, /clientAccountEnabledFor\("talent"\)/);
});
