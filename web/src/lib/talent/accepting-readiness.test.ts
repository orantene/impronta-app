import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applySwitchesToMode,
  assertAcceptingNewContact,
  isDirectTalentChannel,
  pauseBannerCopy,
  servicesCatalogChannel,
  publicContactMode,
  readinessGaps,
  takesMoneyOnline,
  switchSaveImpact,
} from "./accepting-readiness";
import {
  assertAcceptingNewBookings,
  assertInstantPosture,
  resolveEffectiveBookingMode,
} from "../scheduling/instant-book-gates";
import { withPublicAvailability } from "./offering-policy-resolver";
import { deriveOfferingCta } from "./offering-cta-derivation";

const ON = { acceptingBookings: true, acceptingInquiries: true };
const BOOK_OFF = { acceptingBookings: false, acceptingInquiries: true };
const INQ_OFF = { acceptingBookings: true, acceptingInquiries: false };
const BOTH_OFF = { acceptingBookings: false, acceptingInquiries: false };

test("§8 bookings off, inquiries on: every service becomes an inquiry (Consultar)", () => {
  for (const m of ["instant", "request", "inquiry", "closed"] as const) {
    assert.equal(applySwitchesToMode(m, BOOK_OFF), "inquiry");
  }
  assert.equal(publicContactMode(BOOK_OFF), "bookings_paused");
  assert.match(pauseBannerCopy("bookings_paused", "en") ?? "", /Not taking new bookings right now/);
  assert.match(pauseBannerCopy("bookings_paused", "es") ?? "", /No estoy tomando nuevas reservas/);
});

test("§8 bookings on, inquiries off: booking works, inquiry services hide", () => {
  assert.equal(applySwitchesToMode("instant", INQ_OFF), "instant");
  assert.equal(applySwitchesToMode("request", INQ_OFF), "request");
  assert.equal(applySwitchesToMode("inquiry", INQ_OFF), "none");
  assert.equal(pauseBannerCopy(publicContactMode(INQ_OFF), "en"), null);
});

test("§8 both off: portfolio only, no button anywhere", () => {
  for (const m of ["instant", "request", "inquiry", "closed"] as const) {
    assert.equal(applySwitchesToMode(m, BOTH_OFF), "none");
  }
  assert.equal(publicContactMode(BOTH_OFF), "portfolio_only");
  assert.ok(pauseBannerCopy("portfolio_only", "es"));
});

test("§8 all on: the effective mode passes through", () => {
  assert.equal(applySwitchesToMode("instant", ON), "instant");
  assert.equal(applySwitchesToMode("inquiry", ON), "inquiry");
  assert.equal(publicContactMode(ON), "open");
});

test("§1 precedence: master switch beats the service's own instant mode", () => {
  assert.deepEqual(
    resolveEffectiveBookingMode({ offering: { bookingMode: "instant" }, defaults: {}, accepting: false }),
    { mode: "closed", source: "master" },
  );
  assert.equal(
    resolveEffectiveBookingMode({
      offering: { bookingMode: "instant" },
      defaults: {},
      readiness: { instantReady: false },
    }).mode,
    "request",
  );
});

test("readinessGaps: hours, duration, payouts only when money is taken online", () => {
  assert.deepEqual(
    readinessGaps({ hasWorkingHours: true, durationMinutes: 60, takesMoneyOnline: true, payoutsReady: true }),
    [],
  );
  assert.deepEqual(
    readinessGaps({ hasWorkingHours: false, durationMinutes: 0, takesMoneyOnline: true, payoutsReady: false }),
    ["working_hours", "duration", "payouts"],
  );
  assert.deepEqual(
    readinessGaps({ hasWorkingHours: true, durationMinutes: 30, takesMoneyOnline: false, payoutsReady: false }),
    [],
  );
  // Talent-level question: no service, no duration check.
  assert.deepEqual(readinessGaps({ hasWorkingHours: false, takesMoneyOnline: false, payoutsReady: true }), [
    "working_hours",
  ]);
  // Products need no hours or duration.
  assert.deepEqual(
    readinessGaps({ kind: "product", hasWorkingHours: false, durationMinutes: null, takesMoneyOnline: true, payoutsReady: true }),
    [],
  );
  assert.equal(takesMoneyOnline("deposit"), true);
  assert.equal(takesMoneyOnline("full", true), false);
  assert.equal(takesMoneyOnline("free"), false);
});

test("Q3 (owner correction): inquiries off explains the impact, never blocks", () => {
  const services = [
    { id: "a", effectiveMode: "instant" as const },
    { id: "b", effectiveMode: "inquiry" as const },
  ];
  assert.deepEqual(switchSaveImpact({ switches: INQ_OFF, services }), { unavailableIds: ["b"] });
  assert.deepEqual(switchSaveImpact({ switches: ON, services }), { unavailableIds: [] });
  assert.deepEqual(switchSaveImpact({ switches: BOTH_OFF, services }), { unavailableIds: [] });
});

test("Q4 / Q6: a direct instant-book POST is refused when paused or not instant", () => {
  assert.deepEqual(assertAcceptingNewBookings(false), { ok: false, reason: "not_accepting_bookings" });
  assert.equal(assertAcceptingNewBookings(null).ok, true);
  const paused = assertInstantPosture({
    sellingDefaults: { bookingPosture: "instant" },
    bookingMode: "instant",
    staffDesk: false,
    accepting: false,
  });
  assert.equal(!paused.ok && paused.reason, "not_accepting_bookings");
  const inquiryOnly = assertInstantPosture({ sellingDefaults: { bookingPosture: "inquiry" }, bookingMode: null, staffDesk: false });
  assert.equal(!inquiryOnly.ok && inquiryOnly.reason, "inquiry_only");
  const notReady = assertInstantPosture({
    sellingDefaults: {},
    bookingMode: "instant",
    staffDesk: false,
    readiness: { instantReady: false },
  });
  assert.equal(!notReady.ok && notReady.reason, "request_only");
  // The till is exempt: staff are the confirmation.
  assert.equal(
    assertInstantPosture({ sellingDefaults: {}, bookingMode: "instant", staffDesk: true, accepting: false }).ok,
    true,
  );
});

test("new contact on a direct channel: booking requests vs inquiries", () => {
  assert.deepEqual(assertAcceptingNewContact(BOOK_OFF, "booking_request"), { ok: false, reason: "not_accepting_bookings" });
  assert.deepEqual(assertAcceptingNewContact(BOOK_OFF, "inquiry"), { ok: true });
  assert.deepEqual(assertAcceptingNewContact(INQ_OFF, "inquiry"), { ok: false, reason: "not_accepting_inquiries" });
  assert.deepEqual(assertAcceptingNewContact(INQ_OFF, "booking_request"), { ok: true });
});

test("§7 scope: talent site and the hub itself are direct; agency hosts are not", () => {
  assert.equal(isDirectTalentChannel({ hostKind: "talent_site", hostTenantId: null, tenantId: "x" }), true);
  assert.equal(isDirectTalentChannel({ hostKind: "hub", hostTenantId: "hub", tenantId: "hub" }), true);
  assert.equal(isDirectTalentChannel({ hostKind: "hub", hostTenantId: "hub", tenantId: "agency" }), false);
  assert.equal(isDirectTalentChannel({ hostKind: "agency", hostTenantId: "agency", tenantId: "agency" }), false);
  assert.equal(isDirectTalentChannel({ hostKind: "unknown", hostTenantId: null, tenantId: "x" }), false);
});

const offering = {
  kind: "service",
  bookingMode: "instant" as const,
  priceType: "fixed",
  priceDisplay: "exact",
  amountCents: 50000,
  visibility: "public",
  durationMinutes: 60,
  reserveMode: "full" as const,
  allowPayInPerson: false,
};

test("public availability: the CTA derivation reads the same answer", () => {
  const ready = { payoutsReady: true, hasWorkingHours: true };
  const on = withPublicAvailability(offering, {}, { ...ready, switches: ON });
  assert.equal(deriveOfferingCta({ offering: on as never }).cta, "book_now");

  const paused = withPublicAvailability(offering, {}, { ...ready, switches: BOOK_OFF });
  const pausedCta = deriveOfferingCta({ offering: paused as never });
  assert.equal(pausedCta.cta, "request");
  assert.equal(pausedCta.hidden, false);

  const dark = withPublicAvailability(offering, {}, { ...ready, switches: BOTH_OFF });
  assert.equal(deriveOfferingCta({ offering: dark as never }).hidden, true);

  const noHours = withPublicAvailability(offering, {}, { payoutsReady: true, hasWorkingHours: false, switches: ON });
  assert.equal(noHours.bookingMode, "request");

  // Unknown hours never downgrade; agency-routed (switches null) ignores the pause.
  const unknown = withPublicAvailability(offering, {}, { payoutsReady: true, hasWorkingHours: null, switches: null });
  assert.equal(unknown.bookingMode, "instant");
});

test("Q1: Jor's shape (hours + duration + online collect ready, deposit) stays instant", () => {
  const jor = { ...offering, reserveMode: "deposit" as const };
  const out = withPublicAvailability(jor, {}, { payoutsReady: true, hasWorkingHours: true, switches: ON });
  assert.equal(out.bookingMode, "instant");
  assert.equal(
    assertInstantPosture({ sellingDefaults: {}, bookingMode: "instant", staffDesk: false, accepting: true, readiness: { instantReady: true } }).ok,
    true,
  );
});

test("PAY-2: deposit + online collect ready + hours keeps book_now (not request_to_book chat)", () => {
  // Tip FAIL on 255ecfd7: SSR onlineCollectReady:true / confirmsByHand:false but
  // missing fixture hours → readiness request → Solicitar cita / Chateá ahora.
  const deposit = {
    ...offering,
    reserveMode: "deposit" as const,
    depositPct: 30,
    allowPayInPerson: false,
  };
  const ready = withPublicAvailability(deposit, {}, {
    payoutsReady: true,
    hasWorkingHours: true,
    switches: ON,
  });
  assert.equal(ready.bookingMode, "instant");
  const ctaReady = deriveOfferingCta({ offering: ready as never, confirmsByHand: false });
  assert.equal(ctaReady.cta, "book_now");
  assert.equal(ctaReady.intent, "instant");

  const noHours = withPublicAvailability(deposit, {}, {
    payoutsReady: true,
    hasWorkingHours: false,
    switches: ON,
  });
  assert.equal(noHours.bookingMode, "request");
  assert.equal(noHours.reserveMode, "deposit");
  assert.equal(
    deriveOfferingCta({ offering: noHours as never, confirmsByHand: false }).cta,
    "request_to_book",
  );
});

test("Q3/§7: an agency homepage catalog never applies the talent's switches", () => {
  assert.equal(servicesCatalogChannel({ explicitTalentProfileId: null }), "agency");
  assert.equal(servicesCatalogChannel({ explicitTalentProfileId: "tal-1" }), "direct");
  // Agency channel = switches null: a paused talent still shows instant there.
  const agency = withPublicAvailability(offering, {}, { payoutsReady: true, hasWorkingHours: true, switches: null });
  assert.equal(agency.bookingMode, "instant");
  assert.equal((agency as { publicCtaHidden?: boolean }).publicCtaHidden, undefined);
});

test("correction 1: pay-at-visit (free) instant never needs payouts", () => {
  assert.deepEqual(
    readinessGaps({ hasWorkingHours: true, durationMinutes: 45, takesMoneyOnline: takesMoneyOnline("free"), payoutsReady: false }),
    [],
  );
  const free = { ...offering, reserveMode: "free" as const };
  assert.equal(
    withPublicAvailability(free, {}, { payoutsReady: false, hasWorkingHours: true, switches: ON }).bookingMode,
    "instant",
  );
});

test("correction 1: a readiness fallback keeps the deposit / full requirement", () => {
  const deposit = { ...offering, reserveMode: "deposit" as const, depositPct: 30 };
  const out = withPublicAvailability(deposit, {}, { payoutsReady: false, hasWorkingHours: true, switches: ON });
  assert.equal(out.bookingMode, "request");
  assert.equal(out.reserveMode, "deposit");
  assert.equal(out.depositPct, 30);
  const full = withPublicAvailability(offering, {}, { payoutsReady: true, hasWorkingHours: false, switches: ON });
  assert.equal(full.bookingMode, "request");
  assert.equal(full.reserveMode, "full");
});

test("correction 2: a returning client's NEW booking is refused while paused", () => {
  // The gate has no notion of who is asking: a known client is refused too.
  // Only existing bookings, threads and manage links bypass it (they never call it).
  const g = assertInstantPosture({ sellingDefaults: {}, bookingMode: "instant", staffDesk: false, accepting: false });
  assert.equal(!g.ok && g.reason, "not_accepting_bookings");
  assert.deepEqual(assertAcceptingNewContact(BOOK_OFF, "booking_request"), { ok: false, reason: "not_accepting_bookings" });
});

test("correction 3: both off is an honest unavailable state, never Consultar", () => {
  for (const mode of ["instant", "request", "inquiry"] as const) {
    const o = withPublicAvailability({ ...offering, bookingMode: mode }, {}, { payoutsReady: true, hasWorkingHours: true, switches: BOTH_OFF });
    assert.equal(deriveOfferingCta({ offering: o as never }).hidden, true);
  }
  assert.ok(pauseBannerCopy("portfolio_only", "en"));
  assert.doesNotMatch(pauseBannerCopy("portfolio_only", "es") ?? "", /consultarme/);
  // Consultar only when inquiries are on.
  const paused = withPublicAvailability(offering, {}, { payoutsReady: true, hasWorkingHours: true, switches: BOOK_OFF });
  assert.equal(deriveOfferingCta({ offering: paused as never }).cta, "request");
});
