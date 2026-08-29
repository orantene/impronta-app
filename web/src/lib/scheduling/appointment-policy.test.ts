import test from "node:test";
import assert from "node:assert/strict";

import {
  parseTenantAppointmentSettings,
  resolveAppointmentPolicy,
} from "./appointment-policy";
import { getAppointmentsPlanPolicy } from "./appointments-plan-policy";
import { resolveTerminology, terminologyCopy } from "./terminology";

test("existing tenants stay M0: enabled defaults false", () => {
  const policy = resolveAppointmentPolicy({
    tenant: null,
    planTier: "agency",
    offering: { bookingMode: "request", durationMinutes: 30 },
  });
  assert.equal(policy.enabled, false);
  assert.equal(policy.effectiveMode, "off");
});

test("resource profiles skip talent opt-in once the tenant switch is on", () => {
  const policy = resolveAppointmentPolicy({
    tenant: { enabled: true, allowTalentDirectBooking: false },
    talent: { profileKind: "resource" },
    planTier: "studio",
    offering: { bookingMode: "request", durationMinutes: 30 },
  });
  assert.equal(policy.enabled, true);
  assert.equal(policy.effectiveMode, "request");
});

test("person profiles AND-gate agency allow + talent opt-in", () => {
  const base = {
    tenant: { enabled: true, allowTalentDirectBooking: true },
    planTier: "free" as const,
    offering: { bookingMode: "request" as const, durationMinutes: 30 },
  };
  assert.equal(
    resolveAppointmentPolicy({ ...base, talent: { profileKind: "person", directBookingOptIn: false } }).enabled,
    false,
  );
  assert.equal(
    resolveAppointmentPolicy({ ...base, talent: { profileKind: "person", directBookingOptIn: true } }).enabled,
    true,
  );
  assert.equal(
    resolveAppointmentPolicy({
      tenant: { enabled: true, allowTalentDirectBooking: false },
      talent: { profileKind: "person", directBookingOptIn: true },
      planTier: "free",
      offering: { bookingMode: "request" },
    }).enabled,
    false,
  );
});

test("plan ceiling: free cannot climb past request even if offering is instant", () => {
  const policy = resolveAppointmentPolicy({
    tenant: { enabled: true, allowTalentDirectBooking: true },
    talent: { profileKind: "person", directBookingOptIn: true },
    planTier: "free",
    offering: { bookingMode: "instant", reserveMode: "full", durationMinutes: 30 },
  });
  assert.equal(policy.requestedMode, "full");
  assert.equal(policy.maxMode, "request");
  assert.equal(policy.effectiveMode, "request");
});

test("unknown plan fails closed (maxMode off)", () => {
  const p = getAppointmentsPlanPolicy("enterprise-gold");
  assert.equal(p.maxMode, "off");
  assert.equal(p.calendarSync, false);
  assert.equal(p.multiStaff, false);
  assert.equal(p.recurring, false);
});

test("agency/network unlock sync, multi-staff, recurring", () => {
  const a = getAppointmentsPlanPolicy("agency");
  assert.equal(a.maxMode, "full");
  assert.equal(a.calendarSync, true);
  assert.equal(a.multiStaff, true);
  assert.equal(a.recurring, true);
  assert.deepEqual(getAppointmentsPlanPolicy("network").calendarSync, true);
});

test("offering duration is the most specific layer", () => {
  const policy = resolveAppointmentPolicy({
    tenant: { enabled: true, allowTalentDirectBooking: true, timezone: "UTC" },
    talent: { profileKind: "resource" },
    hours: {
      timezone: "America/Cancun",
      weekly: {},
      slot_minutes: 30,
    },
    offering: { bookingMode: "request", durationMinutes: 45 },
    planTier: "website",
  });
  assert.equal(policy.durationMinutes, 45);
  assert.equal(policy.timezone, "America/Cancun");
  assert.equal(policy.resolvedFrom, "offering");
});

test("parseTenantAppointmentSettings reads the appointments node or the whole blob", () => {
  assert.equal(parseTenantAppointmentSettings({ appointments: { enabled: true } })?.enabled, true);
  assert.equal(parseTenantAppointmentSettings({ enabled: false })?.enabled, false);
  assert.equal(parseTenantAppointmentSettings(null), null);
});

test("terminology defaults to reservations/reservas and has no em dashes", () => {
  const def = resolveTerminology(undefined);
  assert.equal(def.id, "reservations");
  assert.equal(def.es.plural, "reservas");
  assert.equal(terminologyCopy("appointments", "es").plural, "citas");
  assert.equal(terminologyCopy("bookings", "es").plural, "reservaciones");
  for (const id of ["reservations", "appointments", "bookings"] as const) {
    const bundle = resolveTerminology(id);
    for (const locale of ["en", "es"] as const) {
      for (const value of Object.values(bundle[locale])) {
        assert.equal(value.includes("\u2014"), false, `${id}.${locale} has an em dash`);
        assert.ok(value.trim().length > 0);
      }
    }
  }
});
