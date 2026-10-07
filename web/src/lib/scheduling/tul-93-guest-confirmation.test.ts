/**
 * TUL-93: the guest confirmation goes to the typed email, in the site
 * language, at the real appointment time.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveInstantBookActor } from "./instant-book-guest";
import { resolveSessionBookingIdentity } from "./instant-book-session-identity";
import {
  formatAppointmentWhen,
  normalizeBookingLocale,
  resolveBookingLocale,
} from "./booking-locale";
import { enrichBookingFromReservation, overrideFitsHold } from "./reservation-convert";
import { collectBusyIntervals } from "./load-busy";
import { generateSlots } from "./slots";
import type { BookingHours } from "./hours-types";
import { hydrateRecipient } from "../notifications/audience";
import {
  bookingConfirmedClient,
  pickBookingClientMember,
} from "../notifications/catalog-audiences-booking";

const SESSION_ID = "77afcae9-0000-4000-8000-000000000001";

describe("1. recipient: a signed-in non-client is never the guest client", () => {
  const base = {
    sessionUserId: SESSION_ID,
    sessionEmail: "oranteneai@gmail.com",
    typedEmail: "Orantene+qa-tul92@gmail.com",
    typedName: "QA Guest",
  };

  it("signed-in talent/staff/workspace owner + typed guest email: not attached, email = typed", () => {
    const r = resolveSessionBookingIdentity({ ...base, sessionIsClient: false });
    assert.deepEqual(r, {
      ok: true,
      userId: null,
      contactEmail: "orantene+qa-tul92@gmail.com",
      contactName: "QA Guest",
    });
  });

  it("signed-in non-client who typed their OWN email is still not attached", () => {
    const r = resolveSessionBookingIdentity({
      ...base,
      sessionIsClient: false,
      typedEmail: "oranteneai@gmail.com",
    });
    assert.equal(r.ok && r.userId, null);
  });

  it("signed-in client + DIFFERENT typed email: typed email, nothing of the session attached", () => {
    const r = resolveSessionBookingIdentity({
      ...base,
      sessionIsClient: true,
    });
    assert.equal(r.ok && r.userId, null);
    assert.equal(r.ok && r.contactEmail, "orantene+qa-tul92@gmail.com");
  });

  it("signed-in client + SAME email (any case): attached", () => {
    const r = resolveSessionBookingIdentity({
      ...base,
      sessionIsClient: true,
      typedEmail: " OranteneAI@gmail.com ",
    });
    assert.equal(r.ok && r.userId, SESSION_ID);
    assert.equal(r.ok && r.contactEmail, "oranteneai@gmail.com");
  });

  it("nothing typed: a client may use its own address, a non-client must type one", () => {
    const client = resolveSessionBookingIdentity({ ...base, sessionIsClient: true, typedEmail: "" });
    assert.equal(client.ok && client.userId, SESSION_ID);
    assert.equal(client.ok && client.contactEmail, "oranteneai@gmail.com");
    const staff = resolveSessionBookingIdentity({ ...base, sessionIsClient: false, typedEmail: "" });
    assert.deepEqual(staff, { ok: false, reason: "validation" });
  });

  it("the real resolver applies the rule (shared-cookie business account)", async () => {
    const actor = await resolveInstantBookActor({
      user: { id: SESSION_ID, email: "oranteneai@gmail.com" },
      tenantId: "t1",
      requireAccount: false,
      contactName: "QA Guest",
      contactEmail: "orantene+qa-tul92@gmail.com",
      __hooks: { sessionIsClient: async () => false },
    });
    if (actor.kind !== "session") throw new Error(`expected a session actor, got ${actor.kind}`);
    assert.equal(actor.userId, null);
    assert.equal(actor.contactEmail, "orantene+qa-tul92@gmail.com");
  });

  it("the real resolver attaches a signed-in client who typed their own email", async () => {
    const actor = await resolveInstantBookActor({
      user: { id: SESSION_ID, email: "client@example.com" },
      tenantId: "t1",
      requireAccount: false,
      contactEmail: "client@example.com",
      __hooks: { sessionIsClient: async () => true },
    });
    assert.equal(actor.kind === "session" && actor.userId, SESSION_ID);
  });

  it("notification audience: an account attached on a legacy row never beats the typed email", async () => {
    // Legacy row: client_user_id = the business account, contact_email = typed.
    const legacy = pickBookingClientMember({
      clientUserId: SESSION_ID,
      authEmail: "oranteneai@gmail.com",
      contactEmail: "orantene+qa-tul92@gmail.com",
      contactName: "QA Guest",
      locale: "es",
    });
    assert.deepEqual(legacy, {
      kind: "guest",
      email: "orantene+qa-tul92@gmail.com",
      displayName: "QA Guest",
      role: "client",
      locale: "es",
    });
    const same = pickBookingClientMember({
      clientUserId: SESSION_ID,
      authEmail: "Client@Example.com",
      contactEmail: "client@example.com",
      contactName: null,
      locale: null,
    });
    assert.equal(same?.kind, "user");
    // Lookup failed (authEmail unknown): safe side is the typed address.
    const unknown = pickBookingClientMember({
      clientUserId: SESSION_ID,
      authEmail: null,
      contactEmail: "typed@example.com",
      contactName: null,
      locale: null,
    });
    assert.equal(unknown?.kind, "guest");
  });

  it("bookingConfirmedClient with a guest (no account) mails the typed address in the booking locale", async () => {
    const members = await bookingConfirmedClient({
      type: "booking.confirmed",
      tenantId: "t1",
      inquiryId: "i1",
      eventId: "e1",
      payload: { contactEmail: "guest@example.com", contactName: "G", locale: "es" },
    } as never);
    assert.deepEqual(members, [
      { kind: "guest", email: "guest@example.com", displayName: "G", role: "client", locale: "es" },
    ]);
  });
});

describe("2. language: an ES-site booking is confirmed in Spanish", () => {
  it("normalises and falls back: browsing, then talent preferred, then platform default", () => {
    assert.equal(normalizeBookingLocale("es-MX"), "es");
    assert.equal(normalizeBookingLocale("fr"), null);
    assert.equal(resolveBookingLocale({ browsing: "es", talentPreferred: "en", platformDefault: "en" }), "es");
    assert.equal(resolveBookingLocale({ browsing: null, talentPreferred: "es", platformDefault: "en" }), "es");
    assert.equal(resolveBookingLocale({ browsing: "fr", talentPreferred: null, platformDefault: "es" }), "es");
    assert.equal(resolveBookingLocale({}), "en");
  });

  it("the recipient carries the booking locale as an explicit override", async () => {
    const guest = await hydrateRecipient(
      { kind: "guest", email: "g@example.com", role: "client", locale: "es" },
      { admin: {} } as never,
    );
    assert.equal(guest?.locale, "es");
    assert.equal(guest?.localeIsExplicit, true);
    const plain = await hydrateRecipient({ kind: "guest", email: "g@example.com" }, { admin: {} } as never);
    assert.equal(plain?.locale, "en");
    assert.equal(plain?.localeIsExplicit, undefined);
  });
});

describe("3. time: stored start/end are the real appointment, the buffer still blocks", () => {
  // 13:30 to 14:30 America/Cancun (UTC-5) with a 15 min buffer on each side.
  const REAL = { startsAt: "2026-10-14T18:30:00.000Z", endsAt: "2026-10-14T19:30:00.000Z" };
  const PADDED_HOLD = { starts_at: "2026-10-14T18:15:00.000Z", ends_at: "2026-10-14T19:45:00.000Z" };

  function holdOnlyClient() {
    const writes: { inserted: Record<string, unknown> | null; stamped: Record<string, unknown> | null } = {
      inserted: null,
      stamped: null,
    };
    const table = (name: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            name === "inquiries"
              ? { data: { id: "i1", tenant_id: "t1", source_context: { locale: "es" }, event_timezone: null }, error: null }
              : { data: null, error: null },
          order: () => ({
            limit: async () =>
              name === "talent_holds"
                ? {
                    data: [
                      {
                        id: "h1",
                        talent_profile_id: "tp1",
                        tenant_id: "t1",
                        ...PADDED_HOLD,
                        title: "Lifting",
                        expires_at: "2099-01-01T00:00:00.000Z",
                      },
                    ],
                    error: null,
                  }
                : { data: [], error: null },
          }),
        }),
      }),
      insert: async (row: Record<string, unknown>) => {
        writes.inserted = row;
        return { error: null };
      },
      update: (row: Record<string, unknown>) => {
        if (name === "agency_bookings") writes.stamped = row;
        return { eq: async () => ({ error: null }) };
      },
      delete: () => ({ eq: () => ({ select: async () => ({ data: [], error: null }) }) }),
    });
    return { client: { from: table } as never, writes };
  }

  it("with the real window passed, the booking and mirror are 13:30 to 14:30 in the talent zone", async () => {
    const { client, writes } = holdOnlyClient();
    const res = await enrichBookingFromReservation(client, {
      inquiryId: "i1",
      bookingId: "b1",
      appointment: { ...REAL, timezone: "America/Cancun" },
    });
    assert.equal(res.ok, true);
    assert.equal(writes.inserted?.starts_at, REAL.startsAt);
    assert.equal(writes.inserted?.ends_at, REAL.endsAt);
    assert.equal(writes.stamped?.starts_at, REAL.startsAt);
    assert.equal(writes.stamped?.ends_at, REAL.endsAt);
    assert.equal(writes.stamped?.timezone, "America/Cancun");
  });

  it("without it (Messages pick-time) the hold window is unchanged", async () => {
    const { client, writes } = holdOnlyClient();
    await enrichBookingFromReservation(client, { inquiryId: "i1", bookingId: "b1" });
    assert.equal(writes.inserted?.starts_at, new Date(PADDED_HOLD.starts_at).toISOString());
    assert.equal(writes.stamped?.timezone, "UTC");
  });

  it("an override that is not inside the hold is ignored", () => {
    assert.equal(overrideFitsHold({ ...REAL }, PADDED_HOLD), true);
    assert.equal(
      overrideFitsHold({ startsAt: "2026-10-15T18:30:00.000Z", endsAt: "2026-10-15T19:30:00.000Z" }, PADDED_HOLD),
      false,
    );
    assert.equal(overrideFitsHold({ startsAt: REAL.endsAt, endsAt: REAL.startsAt }, PADDED_HOLD), false);
  });

  it("the confirmation reads 13:30 (ES and EN), not the padded 13:15", () => {
    const es = formatAppointmentWhen({ ...REAL, timeZone: "America/Cancun", locale: "es" });
    assert.match(es ?? "", /13:30 - 14:30/);
    const en = formatAppointmentWhen({ ...REAL, timeZone: "America/Cancun", locale: "en" });
    assert.match(en ?? "", /13:30 - 14:30/);
    assert.doesNotMatch(es ?? "", /13:15/);
    // A bad zone never throws inside a render.
    assert.ok(formatAppointmentWhen({ ...REAL, timeZone: "Not/AZone", locale: "en" }));
  });

  it("the buffer STILL blocks adjacent slots when the stored booking is the real window", () => {
    const hours: BookingHours = {
      timezone: "America/Cancun",
      weekly: {
        0: [],
        1: [],
        2: [],
        3: [{ startMin: 9 * 60, endMin: 18 * 60 }], // Wednesday
        4: [],
        5: [],
        6: [],
      },
      exceptions: [],
      slotMinutes: 15,
      bufferBeforeMin: 15,
      bufferAfterMin: 15,
      minNoticeMin: 0,
      horizonDays: 1,
    };
    // The stored mirror row: REAL window, no padding in the row itself.
    const busy = collectBusyIntervals({
      bookings: [{ starts_at: REAL.startsAt, ends_at: REAL.endsAt, status: "confirmed" }],
    });
    const slots = generateSlots({
      hours,
      durationMinutes: 60,
      from: new Date("2026-10-14T14:00:00.000Z"), // 09:00 Cancun, Wednesday
      busy,
    }).map((s) =>
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZone: "America/Cancun",
      }).format(s.startsAt),
    );
    // A following booking cannot start inside the 15 min after-buffer (14:30 to 14:45).
    assert.ok(!slots.includes("14:30"), "14:30 is inside the buffer");
    assert.ok(!slots.includes("14:40") && !slots.includes("14:35"));
    assert.ok(slots.includes("14:45"), "the first slot after the buffer is offered");
    // And nothing may END inside the before-buffer (12:45 start ends 13:45: overlaps).
    assert.ok(!slots.includes("12:30"), "a 60 min slot at 12:30 would end inside the booking");
    assert.ok(slots.includes("12:15"), "12:15 to 13:15 ends before the 13:15 before-buffer");
  });
});
