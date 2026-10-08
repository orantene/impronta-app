/**
 * TUL-136: the day-of reminder says appointment/cita for a talent-site booking
 * and keeps event/evento for an agency booking, in subject, bell and body.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { bookingNoun, tradeNounForCategory } from "./booking-noun";
import { findCatalogEntryById } from "./catalog";
import { getEmailSubject } from "./email-copy";
import type { NotificationEvent, ResolvedRecipient } from "./types";

const talentPayload = {
  talentBookingId: "tb-1",
  appointmentStartsAt: "2026-10-09T14:45:00Z",
  appointmentTimezone: "America/Cancun",
  appointmentTitle: "Lash lift",
};

function ev(payload: Record<string, unknown>): NotificationEvent {
  return {
    type: "booking.day_of_reminder",
    tenantId: "t1",
    inquiryId: "inq-1",
    eventId: "e1",
    payload,
  };
}

function recipient(role: ResolvedRecipient["role"]): ResolvedRecipient {
  return {
    userId: "u1",
    email: "p@tulala.digital",
    displayName: "Giulia",
    locale: "en",
    isPlatformAdmin: false,
    role,
    dedupeId: "u1",
  };
}

const brandFor = (locale: "en" | "es") => ({
  wordmark: "TULALA",
  accountName: "Tulala",
  footerDomain: "tulala.digital",
  homeHref: "https://tulala.digital",
  locale,
});

test("bookingNoun: talent-site signal -> appointment, agency -> event, explicit kind wins", () => {
  assert.equal(bookingNoun(talentPayload), "appointment");
  assert.equal(bookingNoun({ appointmentStartsAt: "2026-10-09T14:45:00Z" }), "appointment");
  assert.equal(bookingNoun({ bookingId: "b1", eventDate: "2026-06-14" }), "event");
  assert.equal(bookingNoun({}), "event");
  assert.equal(bookingNoun(null), "event");
  assert.equal(bookingNoun({ ...talentPayload, bookingKind: "event" }), "event");
  assert.equal(bookingNoun({ bookingKind: "appointment" }), "appointment");
});

test("TUL-259: trade slugs pick the noun on a talent-site booking", () => {
  const withTrade = (talentTradeSlugs: unknown, extra: Record<string, unknown> = {}) => ({
    ...talentPayload,
    talentTradeSlugs,
    ...extra,
  });
  assert.equal(bookingNoun(withTrade(["dj", "djs", "music-djs"])), "event");
  assert.equal(bookingNoun(withTrade(["wedding-photographer", "photography", "photo-video-creative"])), "event");
  assert.equal(bookingNoun(withTrade(["event-planner", "event-planning", "production-bts"])), "event");
  assert.equal(bookingNoun(withTrade(["lash-artist", "beauty-services", "wellness-beauty"])), "appointment");
  assert.equal(bookingNoun(withTrade(["nail-artist", "beauty-services", "wellness-beauty"])), "appointment");
  assert.equal(bookingNoun(withTrade(["some-new-type", "some-group"])), "appointment");
  assert.equal(bookingNoun(withTrade([])), "appointment");
  assert.equal(bookingNoun(withTrade(["lash-artist"], { bookingKind: "event" })), "event");
  assert.equal(bookingNoun(withTrade(["dj"], { bookingKind: "appointment" })), "appointment");
  assert.equal(tradeNounForCategory("DJ"), "event");
  assert.equal(tradeNounForCategory("unknown-slug"), null);
  assert.equal(tradeNounForCategory(null), null);
});

test("TUL-259: DJ talent-site reminder reads event/evento, lash reads appointment/cita", () => {
  const entry = findCatalogEntryById("booking.day_of_reminder.client")!;
  const r = recipient("client");
  const dj = ev({ ...talentPayload, talentTradeSlugs: ["dj", "djs", "music-djs"] });
  const lash = ev({ ...talentPayload, talentTradeSlugs: ["lash-artist", "beauty-services", "wellness-beauty"] });
  const html = (e: NotificationEvent, locale: "en" | "es") =>
    renderToStaticMarkup(entry.email!.render({ event: e, recipient: r, brand: brandFor(locale) }));
  assert.match(html(dj, "en"), /Your event is tomorrow/);
  assert.match(html(dj, "es"), /Tu evento es mañana/);
  assert.match(html(lash, "en"), /Your appointment is tomorrow/);
  assert.match(html(lash, "es"), /Tu cita es mañana/);
  assert.equal(entry.email!.subject(dj, r), "Reminder: your event is tomorrow");
  assert.equal(entry.email!.subject(lash, r), "Reminder: your appointment is tomorrow");
});

for (const id of ["booking.day_of_reminder.client", "booking.day_of_reminder.talent"]) {
  const role = id.endsWith("client") ? "client" : "talent";
  const entry = () => findCatalogEntryById(id)!;

  test(`${id}: bell + English subject follow the noun`, () => {
    const r = recipient(role);
    assert.equal(entry().in_app!.title(ev(talentPayload), r), "Your appointment is tomorrow");
    assert.equal(entry().email!.subject(ev(talentPayload), r), "Reminder: your appointment is tomorrow");
    assert.equal(entry().in_app!.title(ev({}), r), "Your event is tomorrow");
    assert.equal(entry().email!.subject(ev({}), r), "Reminder: your event is tomorrow");
  });

  test(`${id}: rendered body says appointment/cita for talent, event/evento for agency`, () => {
    const r = recipient(role);
    const html = (payload: Record<string, unknown>, locale: "en" | "es") =>
      renderToStaticMarkup(
        entry().email!.render({ event: ev(payload), recipient: r, brand: brandFor(locale) }),
      );
    const enTalent = html(talentPayload, "en");
    assert.match(enTalent, /Your appointment is tomorrow/);
    assert.doesNotMatch(enTalent, /Your event is tomorrow/);
    const esTalent = html(talentPayload, "es");
    assert.match(esTalent, /Tu cita es mañana/);
    assert.doesNotMatch(esTalent, /Tu evento es/);
    const enAgency = html({ eventDate: "2026-06-14" }, "en");
    assert.match(enAgency, /Your event is tomorrow/);
    const esAgency = html({ eventDate: "2026-06-14" }, "es");
    assert.match(esAgency, /Tu evento es mañana/);
  });

  test(`${id}: localized subject follows the noun in both languages`, () => {
    const tid = entry().email!.templateId;
    assert.equal(getEmailSubject("es", tid, "appointment"), "Recordatorio: tu cita es mañana");
    assert.equal(getEmailSubject("en", tid, "appointment"), "Reminder: your appointment is tomorrow");
    assert.equal(getEmailSubject("es", tid, "event"), "Recordatorio: tu evento es mañana");
    assert.equal(getEmailSubject("es", tid), "Recordatorio: tu evento es mañana");
    assert.equal(getEmailSubject("en", tid), "Reminder: your event is tomorrow");
  });
}
