import { test } from "node:test";
import assert from "node:assert/strict";
import type { ReactElement } from "react";
import { findCatalogEntries, findCatalogEntryById } from "./catalog";
import type { NotificationEvent, ResolvedRecipient } from "./types";

/**
 * Slice 15.6 — day-of booking reminder (×2 surfaces) + message.new digest.
 *
 * Split out of `catalog.test.ts` to keep that file under the 800-line cap (the
 * same sibling-extraction convention the catalog source modules use). Guards
 * the catalog wiring (id, category, channels, surface routing, digest opt-in)
 * and a render smoke-test for the two Slice 15.6 features. DB-backed audience
 * resolvers (`clientOrGuest`, `allRosterTalent`, `messageThreadAudience`) are
 * exercised at the integration level, not here — only the deterministic,
 * DB-free guard branch of `messageThreadAudience` is asserted.
 */

const brand = {
  wordmark: "TULALA",
  accountName: "Tulala",
  footerDomain: "tulala.digital",
  homeHref: "https://tulala.digital",
};

function recipientWithRole(role: ResolvedRecipient["role"]): ResolvedRecipient {
  return {
    userId: "user-1",
    email: "person@tulala.digital",
    displayName: "Giulia Conti",
    locale: "en",
    isPlatformAdmin: false,
    role,
    dedupeId: "user-1",
  };
}

// ─── booking.day_of_reminder (×2 surfaces) ────────────────────────────────────
//
// Direct-dispatch (the booking-reminders cron, NOT the engine notifyUsers
// path), so each entry owns email + in_app. Two surface-scoped entries (client
// / talent) so the in-app bell routes to the right dashboard and the CTA points
// at each role's own inquiry view. The shared DayOfReminder template takes NO
// contactName — the heading is the neutral "Your event is tomorrow", never the
// client's name (the bug an earlier draft shipped).

const DAY_OF_REMINDER = [
  {
    id: "booking.day_of_reminder.client",
    surface: "client",
    role: "client",
    urlRe: /\/client\/inquiries\/inq-9$/,
  },
  {
    id: "booking.day_of_reminder.talent",
    surface: "talent",
    role: "talent",
    urlRe: /\/talent\/inbox\/inq-9$/,
  },
] as const;

test("catalog: booking.day_of_reminder has two surface-scoped entries, email + in_app", () => {
  for (const { id, surface } of DAY_OF_REMINDER) {
    const entry = findCatalogEntryById(id);
    assert.ok(entry, `missing catalog entry ${id}`);
    assert.equal(entry!.category, "bookings");
    assert.equal(entry!.required, false);
    assert.deepEqual(entry!.defaultChannels, ["email", "in_app"]);
    assert.ok(entry!.email, `${id} should have an email config`);
    assert.ok(entry!.in_app, `${id} should have an in_app config`);
    assert.equal(entry!.in_app!.surface, surface, `${id} surface`);
    assert.equal(entry!.in_app!.kind, "booking");
    assert.equal(typeof entry!.hydrate, "function", `${id} should hydrate inquiry context`);
  }
});

test("catalog: booking.day_of_reminder trigger routes to exactly the two entries", () => {
  const ids = findCatalogEntries("booking.day_of_reminder").map((e) => e.id).sort();
  assert.deepEqual(ids, ["booking.day_of_reminder.client", "booking.day_of_reminder.talent"]);
});

test("catalog: booking.day_of_reminder links point at each surface + carry no contactName", () => {
  const event: NotificationEvent = {
    type: "booking.day_of_reminder",
    tenantId: "tenant-1",
    inquiryId: "inq-9",
    bookingId: "bk-9",
    eventId: "booking-reminder:bk-9",
    payload: {
      contactName: "Sofia Rossi",
      eventDate: "2026-06-14",
      eventLocation: "Lake Como, Italy",
    },
  };
  for (const { id, role, urlRe } of DAY_OF_REMINDER) {
    const entry = findCatalogEntryById(id)!;
    const r = recipientWithRole(role);
    const el = entry.email!.render({ event, recipient: r, brand }) as ReactElement<{
      inquiryUrl: string;
      eventDate: string | null;
      eventLocation: string | null;
      recipientName: string | null;
    }>;
    assert.match(el.props.inquiryUrl, urlRe, `${id} link`);
    // The shared template takes no contactName — passing the client's name as
    // the event subject ("Sofia Rossi is happening tomorrow") was the bug we
    // fixed. Lock it out: the render must never forward contactName.
    assert.equal(
      (el.props as Record<string, unknown>).contactName,
      undefined,
      `${id} must not pass contactName`,
    );
    assert.ok(el.props.eventDate, `${id} eventDate should be a formatted label`);
    assert.equal(el.props.eventLocation, "Lake Como, Italy", `${id} location passthrough`);
    assert.ok(entry.in_app!.title(event, r).length > 0, `${id} in_app title empty`);
    assert.ok((entry.in_app!.body?.(event, r) ?? "").length > 0, `${id} in_app body empty`);
  }
});

test("catalog: booking.day_of_reminder renders fall back gracefully on an empty payload", () => {
  for (const { id, role } of DAY_OF_REMINDER) {
    const entry = findCatalogEntryById(id)!;
    const r = recipientWithRole(role);
    const event: NotificationEvent = {
      type: "booking.day_of_reminder",
      tenantId: "tenant-1",
      inquiryId: "inq-9",
      eventId: id,
      payload: {},
    };
    assert.ok(entry.email!.subject(event, r).length > 0, `${id} subject empty`);
    assert.ok(entry.email!.render({ event, recipient: r, brand }), `${id} render falsy`);
    assert.ok(entry.in_app!.title(event, r).length > 0, `${id} in_app title empty`);
    assert.ok((entry.in_app!.body?.(event, r) ?? "").length > 0, `${id} in_app body empty`);
  }
});

// ─── message.new (email-only, digest-batched) ─────────────────────────────────
//
// message.new is the high-frequency entry that opts into the digest path. Its
// in-app bell is fanned out directly by sendMessage (NOT via notifyUsers, NOT
// via the dispatcher), so the catalog entry must be email-only — routing in_app
// here too would double-bell. The audience resolver (messageThreadAudience)
// reads the inquiry roster via the service role, so the populated path is
// DB-backed (integration-tested); only the DB-free guard branch is asserted
// here, matching the suite's convention for DB resolvers.

test("catalog: message.new is messages, email-only, digest-batched, and has NO in_app", () => {
  const entry = findCatalogEntryById("message.new");
  assert.ok(entry, "missing message.new");
  assert.equal(entry!.category, "messages");
  assert.equal(entry!.required, false);
  assert.deepEqual(entry!.defaultChannels, ["email"]);
  assert.ok(entry!.email, "should have an email config");
  assert.equal(entry!.email!.digest, true, "message.new must opt into the digest path");
  assert.equal(typeof entry!.hydrate, "function", "message.new should hydrate a preview");
  // The in-app bell for messages is fanned out directly by sendMessage; routing
  // in_app here too would double-bell.
  assert.equal(entry!.in_app, undefined, "message.new must not route in_app");
});

test("catalog: inquiry.message_sent routes to message.new", () => {
  assert.ok(findCatalogEntries("inquiry.message_sent").some((e) => e.id === "message.new"));
});

test("catalog: message.new CTA points at the recipient's own surface", () => {
  const entry = findCatalogEntryById("message.new")!;
  const event: NotificationEvent = {
    type: "inquiry.message_sent",
    tenantId: "tenant-1",
    inquiryId: "inq-5",
    userId: "sender-1",
    eventId: "msg:abc",
    payload: { threadType: "group", messageId: "m-1", preview: "See you at 9!" },
  };
  const link = (role: ResolvedRecipient["role"]) =>
    (
      entry.email!.render({ event, recipient: recipientWithRole(role), brand }) as ReactElement<{
        ctaUrl: string;
      }>
    ).props.ctaUrl;
  assert.match(link("client"), /\/client\/inquiries\/inq-5$/);
  assert.match(link("talent"), /\/talent\/inbox\/inq-5$/);
  assert.match(link("workspace_member"), /\/admin\/work\/inq-5$/);
});

test("catalog: message.new render falls back when no preview is hydrated", () => {
  const entry = findCatalogEntryById("message.new")!;
  const event: NotificationEvent = {
    type: "inquiry.message_sent",
    tenantId: "tenant-1",
    inquiryId: "inq-5",
    eventId: "msg:empty",
    payload: {},
  };
  assert.ok(entry.email!.subject(event, recipientWithRole("client")).length > 0);
  assert.ok(entry.email!.render({ event, recipient: recipientWithRole("client"), brand }));
});

test("catalog: message.new audience returns [] without inquiry/tenant scope (guard)", async () => {
  const entry = findCatalogEntryById("message.new")!;
  // Missing inquiryId → no audience (deterministic, DB-free guard branch).
  const noInquiry: NotificationEvent = {
    type: "inquiry.message_sent",
    tenantId: "tenant-1",
    inquiryId: null,
    userId: "sender-1",
    eventId: "msg:guard1",
    payload: { threadType: "group" },
  };
  assert.deepEqual(await entry.resolveAudience(noInquiry, {} as never), []);
  // Missing tenantId → likewise.
  const noTenant: NotificationEvent = {
    type: "inquiry.message_sent",
    tenantId: null,
    inquiryId: "inq-5",
    userId: "sender-1",
    eventId: "msg:guard2",
    payload: { threadType: "group" },
  };
  assert.deepEqual(await entry.resolveAudience(noTenant, {} as never), []);
});
