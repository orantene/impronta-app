/**
 * TUL-426: a booking made on a talent site must leave `inquiries.event_location`
 * filled. Capture (sheet payload) + stamp (server) + the inquiry insert, as pure
 * fixtures. Each test below fails on the old behaviour: the sheet sent no
 * location, `openPurchaseThread` inserted none, and the stamp only ever read
 * `talent_bookings.location_text` (never written on the mirror insert).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  cleanEventLocation,
  pickEventLocation,
  resolveServiceLocation,
  serviceLocationLabel,
} from "./booking-event-location";
import { stampInquiryEventFromBooking } from "./inquiry-event-stamp";
import { openPurchaseThread } from "@/lib/orders/purchase-thread";
import { runCatalogConfirmWrite } from "@/components/public-booking/catalog-booking-confirm";
import type { InstantBookFormPayload } from "@/lib/server-actions/instant-book-types";

const INQ = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TALENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TENANT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OFFERING = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const STARTS = "2027-10-20T16:00:00Z";

type Rows = Record<string, Record<string, unknown> | null>;
type Op = { table: string; op: "update" | "insert"; payload: Record<string, unknown> };

/** Minimal chainable fake: reads return `rows[table]`, writes are recorded. */
function fakeAdmin(rows: Rows) {
  const ops: Op[] = [];
  const admin = {
    from(table: string) {
      let pending: Op | null = null;
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      for (const m of ["select", "eq", "order", "limit", "delete", "in"]) chain[m] = self;
      chain.update = (payload: Record<string, unknown>) => {
        pending = { table, op: "update", payload };
        ops.push(pending);
        return chain;
      };
      chain.insert = (payload: Record<string, unknown>) => {
        pending = { table, op: "insert", payload };
        ops.push(pending);
        return chain;
      };
      chain.maybeSingle = async () => ({ data: rows[table] ?? null, error: null });
      chain.single = async () => ({ data: { id: INQ }, error: null });
      chain.then = (res: (v: { data: null; error: null }) => unknown) => res({ data: null, error: null });
      return chain;
    },
  };
  return { admin: admin as unknown as SupabaseClient, ops };
}

const inquiryUpdate = (ops: Op[]) => ops.find((o) => o.table === "inquiries" && o.op === "update")?.payload;

test("cleanEventLocation trims, collapses, caps and turns empty into null", () => {
  assert.equal(cleanEventLocation("  Calle   1 \n CDMX "), "Calle 1 CDMX");
  assert.equal(cleanEventLocation("   "), null);
  assert.equal(cleanEventLocation(undefined), null);
  assert.equal(cleanEventLocation(42), null);
  assert.equal(cleanEventLocation("x".repeat(500))?.length, 200);
});

test("service location comes from settings only: studio, remote, several, none", () => {
  assert.equal(resolveServiceLocation({ where: ["studio"], venueText: "Calle 1, CDMX", homeCity: "Puebla" }), "Calle 1, CDMX");
  assert.equal(resolveServiceLocation({ where: ["studio"], homeCity: "Puebla" }), "Puebla");
  assert.equal(resolveServiceLocation({ where: ["studio"], locale: "en" }), "At studio");
  assert.equal(resolveServiceLocation({ where: ["remote"], locale: "es" }), "Remoto");
  // A talent with several service locations: every one is named, none invented.
  assert.equal(resolveServiceLocation({ where: ["studio", "client"], venueText: "Calle 1", locale: "en" }), "At studio · At client");
  assert.equal(resolveServiceLocation({ where: [], venueText: "Calle 1", homeCity: "Puebla" }), null);
});

test("pickEventLocation: booking text, then the sheet, then settings; never empty", () => {
  assert.equal(pickEventLocation({ bookingLocationText: "Home", requested: "A", fromSettings: "B" }), "Home");
  assert.equal(pickEventLocation({ bookingLocationText: " ", requested: "A", fromSettings: "B" }), "A");
  assert.equal(pickEventLocation({ requested: "", fromSettings: "B" }), "B");
  assert.equal(pickEventLocation({}), null);
});

test("capture: the sheet sends the offering's delivery label (es + en), and omits it when unknown", async () => {
  assert.equal(serviceLocationLabel(["client"], "es-MX"), "A domicilio");
  assert.equal(serviceLocationLabel(["client"], "en"), "At client");
  assert.equal(serviceLocationLabel([], "en"), null);

  const sent: InstantBookFormPayload[] = [];
  const base = {
    mode: "live" as const,
    intent: "instant" as const,
    locale: "es",
    tenantId: TENANT,
    talentProfileId: TALENT,
    offeringId: OFFERING,
    reserveMode: "free" as const,
    allowPayInPerson: true,
    contactName: "Ana",
    contactEmail: "ana@example.test",
    contactPhone: null,
    variantId: null,
    addOnIds: [],
    liveStarts: STARTS,
    liveTz: "America/Mexico_City",
    bookingDurationMinutes: 30,
    day: new Date("2027-10-20T00:00:00Z"),
    time: null,
    captchaToken: null,
    bookFn: async (p: InstantBookFormPayload) => {
      sent.push(p);
      return { ok: true as const, inquiryId: INQ, bookingId: "b", redirectPath: `/c/${INQ}` };
    },
  };
  await runCatalogConfirmWrite({ ...base, eventLocation: "A domicilio" });
  await runCatalogConfirmWrite({ ...base });
  assert.equal(sent[0]?.eventLocation, "A domicilio");
  assert.equal("eventLocation" in (sent[1] ?? {}), false);
});

test("stamp, instant book: offering where=studio + default venue fills a blank event_location", async () => {
  const { admin, ops } = fakeAdmin({
    inquiries: { event_date: null, event_location: null },
    talent_booking_hours: { timezone: "America/Mexico_City" },
    talent_offerings: { attributes: { where: ["studio"] } },
    talent_profiles: { home_city_text: "Puebla" },
    venues: { timezone: "America/Mexico_City", address_line1: "Calle 1", city: "CDMX" },
  });
  await stampInquiryEventFromBooking(admin, {
    inquiryId: INQ, talentProfileId: TALENT, tenantId: TENANT, startsAt: STARTS, offeringId: OFFERING, locale: "es",
  });
  assert.deepEqual(inquiryUpdate(ops), { event_date: "2027-10-20", event_location: "Calle 1, CDMX" });
});

test("stamp, request path: the stamped offering is remote, so the label is stamped (es)", async () => {
  const { admin, ops } = fakeAdmin({
    inquiries: { event_date: null, event_location: "" },
    talent_offerings: { attributes: { where: ["remote"] } },
  });
  await stampInquiryEventFromBooking(admin, {
    inquiryId: INQ, talentProfileId: TALENT, tenantId: TENANT, startsAt: STARTS, offeringId: OFFERING, locale: "es",
  });
  assert.equal(inquiryUpdate(ops)?.event_location, "Remoto");
});

test("stamp, guest chat booking: a location the guest already gave is never overwritten", async () => {
  const { admin, ops } = fakeAdmin({
    inquiries: { event_date: null, event_location: "Mi casa, Polanco" },
    talent_offerings: { attributes: { where: ["studio"] } },
  });
  await stampInquiryEventFromBooking(admin, {
    inquiryId: INQ, talentProfileId: TALENT, tenantId: TENANT, startsAt: STARTS, offeringId: OFFERING, requestedLocation: "At studio",
  });
  const patch = inquiryUpdate(ops);
  assert.equal(patch?.event_date, "2027-10-20");
  assert.equal(patch ? "event_location" in patch : false, false);
});

test("stamp, location absent: nothing is written as a location (no empty string, no invention)", async () => {
  const { admin, ops } = fakeAdmin({
    inquiries: { event_date: "2027-10-20", event_location: null },
    talent_offerings: { attributes: {} },
    talent_profiles: { home_city_text: "Puebla" },
    venues: { timezone: null, address_line1: "Calle 1", city: "CDMX" },
  });
  await stampInquiryEventFromBooking(admin, {
    inquiryId: INQ, talentProfileId: TALENT, tenantId: TENANT, startsAt: STARTS, offeringId: OFFERING,
  });
  assert.equal(inquiryUpdate(ops), undefined);
});

test("stamp, several service locations: the label names all of them", async () => {
  const { admin, ops } = fakeAdmin({
    inquiries: { event_date: "2027-10-20", event_location: null },
    talent_offerings: { attributes: { where: ["studio", "client"] } },
    venues: { timezone: null, address_line1: "Calle 1", city: "CDMX" },
  });
  await stampInquiryEventFromBooking(admin, {
    inquiryId: INQ, talentProfileId: TALENT, tenantId: TENANT, startsAt: STARTS, offeringId: OFFERING, locale: "en",
  });
  assert.deepEqual(inquiryUpdate(ops), { event_location: "At studio · At client" });
});

test("purchase thread (instant book / request) inserts the inquiry WITH event_location, null when blank", async () => {
  const base = {
    tenantId: TENANT, orderId: "o", actorUserId: null, guestSessionId: "g",
    contact: { displayName: "Ana", email: "ana@example.test" }, holdIds: [], bookingId: null, transactionId: null,
  };
  const withLoc = fakeAdmin({});
  await openPurchaseThread(withLoc.admin, { ...base, eventLocation: "  A domicilio " });
  const ins = withLoc.ops.find((o) => o.table === "inquiries" && o.op === "insert");
  assert.equal(ins?.payload.event_location, "A domicilio");

  const blank = fakeAdmin({});
  await openPurchaseThread(blank.admin, { ...base, eventLocation: "   " });
  const ins2 = blank.ops.find((o) => o.table === "inquiries" && o.op === "insert");
  assert.equal("event_location" in (ins2?.payload ?? {}), false);
});
