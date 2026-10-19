/**
 * TUL-1268 item 3, RUNTIME: the real dispatcher + the real catalog entries run
 * against an in-memory database and in-memory channels. Proves dedupe (one
 * notice per booking, first sender wins), deposit vs balance, and recipients
 * for a booking with no source inquiry.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { dispatchEventNotifications, type ChannelHandler } from "./dispatcher";
import { buildBookingCancelledEvent } from "./producers/booking-cancelled-notify";
import { buildBookingConfirmedEvent } from "./producers/booking-confirmed-notify";
import { buildBookingReservedEvent } from "./producers/booking-reserved-notify";
import type { AudienceContext, ResolvedRecipient } from "./types";

type Row = Record<string, unknown>;

/** Just enough PostgREST: eq/in filters, select/maybeSingle/single, and a unique dedupe_key on the dispatch log. */
function makeCtx(tables: Record<string, Row[]>, users: Record<string, { email: string }>): AudienceContext {
  const logKeys = new Set<string>();
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
    let inserted: Row | null = null;
    const chain: Record<string, unknown> = {};
    chain.select = () => chain;
    chain.eq = (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain);
    chain.in = (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), chain);
    for (const m of ["neq", "is", "not", "order", "limit", "gte", "lte"]) chain[m] = () => chain;
    chain.insert = (row: Row) => {
      if (table === "notification_dispatch_log") {
        const key = String(row.dedupe_key);
        if (logKeys.has(key)) inserted = null;
        else {
          logKeys.add(key);
          inserted = { id: `log-${logKeys.size}` };
          (tables[table] ??= []).push({ ...row, ...inserted });
        }
        const dup = inserted === null;
        const res = { select: () => ({ single: async () => (dup ? { data: null, error: { code: "23505" } } : { data: inserted, error: null }) }) };
        return res;
      }
      (tables[table] ??= []).push(row);
      return chain;
    };
    chain.update = () => chain;
    chain.maybeSingle = async () => ({ data: rows()[0] ?? null, error: null });
    chain.single = async () => ({ data: rows()[0] ?? null, error: null });
    chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows(), error: null, count: rows().length });
    return chain;
  };
  const admin = {
    from,
    rpc: async () => ({ data: null, error: null }),
    auth: {
      admin: {
        getUserById: async (id: string) =>
          users[id] ? { data: { user: { id, email: users[id]!.email, user_metadata: {} } }, error: null } : { data: { user: null }, error: null },
      },
    },
  };
  return { admin } as unknown as AudienceContext;
}

type Sent = { entry: string; to: string; channel: string; html: string; title?: string };

function makeHandlers(sent: Sent[]): Partial<Record<"email" | "in_app", ChannelHandler>> {
  const brandOf = (r: ResolvedRecipient) => ({
    locale: r.locale, wordmark: "T", accountName: "T", footerDomain: "t.test", homeHref: "https://t.test",
  });
  return {
    email: async (event, entry, recipient) => {
      const html = renderToStaticMarkup(entry.email!.render({ event, recipient, brand: brandOf(recipient) }));
      sent.push({ entry: entry.id, to: recipient.dedupeId, channel: "email", html });
      return `ref-${sent.length}`;
    },
    in_app: async (event, entry, recipient) => {
      sent.push({ entry: entry.id, to: recipient.dedupeId, channel: "in_app", html: "", title: entry.in_app!.title(event, recipient) });
      return `ref-${sent.length}`;
    },
  };
}

const booking = {
  id: "b1", tenant_id: "t1", starts_at: "2099-10-14T19:30:00.000Z", ends_at: "2099-10-14T20:30:00.000Z",
  timezone: "America/Cancun", title: "Corte de cabello", total_client_revenue: 1000, currency_code: "MXN",
  contact_name: "QA Guest", contact_email: "guest@x.test", client_user_id: null,
};

/** A booking made on the engine: no source inquiry, client on the booking row, talent via booking_talent. */
function noInquiryDb() {
  return makeCtx(
    {
      agency_bookings: [booking],
      booking_talent: [{ booking_id: "b1", tenant_id: "t1", talent_profile_id: "tp1" }],
      talent_profiles: [{ id: "tp1", user_id: "u-talent" }],
      agency_memberships: [{ tenant_id: "t1", profile_id: "u-admin", status: "active", role: "owner" }],
    },
    { "u-talent": { email: "talent@x.test" }, "u-admin": { email: "admin@x.test" } },
  );
}

/** A booking with an inquiry, so the old pipeline path and the funnel can both fire. */
function inquiryDb(locale: string | null = null) {
  return makeCtx(
    {
      agency_bookings: [booking],
      inquiries: [{ id: "inq1", tenant_id: "t1", contact_name: "QA Guest", contact_email: "guest@x.test", client_user_id: null, coordinator_id: "u-admin", event_date: null, event_location: null, current_offer_id: null, source_context: locale ? { locale } : null }],
      inquiry_participants: [{ inquiry_id: "inq1", tenant_id: "t1", role: "talent", status: "active", user_id: "u-talent" }],
      booking_talent: [{ booking_id: "b1", tenant_id: "t1", talent_profile_id: "tp1" }],
      talent_profiles: [{ id: "tp1", user_id: "u-talent" }],
      agency_memberships: [{ tenant_id: "t1", profile_id: "u-admin", status: "active", role: "owner" }],
    },
    { "u-talent": { email: "talent@x.test" }, "u-admin": { email: "admin@x.test" } },
  );
}

const forEntries = (sent: Sent[], prefix: string) => sent.filter((s) => s.entry.startsWith(prefix));

test("cancel with no source inquiry reaches the client, the talent and the workspace default", async () => {
  const sent: Sent[] = [];
  const ctx = noInquiryDb();
  const ev = buildBookingCancelledEvent({ tenantId: "t1", inquiryId: null, bookingId: "b1", extra: { paidCents: 80000, refundCents: 80000, currency: "MXN", cancelledBy: "client" } });
  await dispatchEventNotifications(ev, { ctx, handlers: makeHandlers(sent) });
  const emails = sent.filter((s) => s.channel === "email");
  assert.deepEqual(emails.map((s) => s.entry).sort(), ["booking.cancelled.client", "booking.cancelled.coordinator", "booking.cancelled.talent"]);
  assert.equal(emails.find((s) => s.entry.endsWith("client"))!.to, "guest:guest@x.test");
  assert.equal(emails.find((s) => s.entry.endsWith("talent"))!.to, "u-talent");
  assert.equal(emails.find((s) => s.entry.endsWith("coordinator"))!.to, "u-admin");
  assert.equal(sent.filter((s) => s.channel === "in_app").length, 2, "talent + coordinator have accounts; the guest is email only");
  assert.match(emails.find((s) => s.entry.endsWith("client"))!.html, /Corte de cabello/);
  assert.doesNotMatch(emails.find((s) => s.entry.endsWith("talent"))!.html, /Refund|800/, "the talent never sees the refund line");
});

test("pipeline cancel then funnel cancel: exactly one notice, in the FIRST sender's copy", async () => {
  const sent: Sent[] = [];
  const ctx = inquiryDb();
  const handlers = makeHandlers(sent);
  // 1) staff pipeline cancel: no amounts, says the team cancelled.
  const pipeline = buildBookingCancelledEvent({ tenantId: "t1", inquiryId: "inq1", bookingId: "b1", extra: { cancelledBy: "staff" } });
  await dispatchEventNotifications(pipeline, { ctx, handlers });
  const first = sent.length;
  assert.ok(first >= 2);
  // 2) the funnel then sends its own (with amounts and 'client'): suppressed.
  const funnel = buildBookingCancelledEvent({ tenantId: "t1", inquiryId: "inq1", bookingId: "b1", extra: { paidCents: 80000, refundCents: 80000, currency: "MXN", cancelledBy: "client" } });
  const result = await dispatchEventNotifications(funnel, { ctx, handlers });
  assert.equal(sent.length, first, "nothing more is sent");
  assert.equal(result.dispatched, 0);
  const client = sent.find((s) => s.entry === "booking.cancelled.client" && s.channel === "email")!;
  assert.match(client.html, /The team cancelled this booking/);
  assert.doesNotMatch(client.html, /Refund/, "pipeline sent no amounts, so no refund line");
  // (The inquiry roster resolves talents through a service-role client the in-memory db does not stand in for.)
  for (const e of ["client", "coordinator"]) {
    assert.equal(sent.filter((s) => s.entry === `booking.cancelled.${e}` && s.channel === "email").length, 1);
  }
});

test("expiry cron: says it expired, with nothing to refund", async () => {
  const sent: Sent[] = [];
  const ev = buildBookingCancelledEvent({ tenantId: "t1", inquiryId: "inq1", bookingId: "b1", extra: { paidCents: 0, refundCents: 0, cancelledBy: "system", cancelReason: "expired" } });
  await dispatchEventNotifications(ev, { ctx: inquiryDb(), handlers: makeHandlers(sent) });
  const client = sent.find((s) => s.entry === "booking.cancelled.client" && s.channel === "email")!;
  assert.match(client.html, /expired before it was confirmed/);
  assert.match(client.html, /nothing to refund/);
});

test("deposit then balance: two different notices, each exactly once; a replay adds nothing", async () => {
  const sent: Sent[] = [];
  const ctx = inquiryDb();
  const handlers = makeHandlers(sent);
  const reserved = buildBookingReservedEvent({ tenantId: "t1", inquiryId: null, bookingId: "b1", depositCents: 30000, currency: "MXN" });
  const confirmed = buildBookingConfirmedEvent({ tenantId: "t1", inquiryId: "inq1", bookingId: "b1" });

  await dispatchEventNotifications(reserved, { ctx, handlers });
  const afterDeposit = [...sent];
  assert.deepEqual(forEntries(afterDeposit, "booking.confirmed").length, 0, "a deposit never says 'Booking confirmed'");
  const clientMail = afterDeposit.find((s) => s.entry === "booking.reserved.client" && s.channel === "email")!;
  assert.match(clientMail.html, /Booking reserved/);
  assert.match(clientMail.html, /Deposit paid/);
  assert.match(clientMail.html, /300/);
  assert.match(clientMail.html, /Balance due/);
  assert.match(clientMail.html, /700/);
  assert.doesNotMatch(clientMail.html, /Booking confirmed/);
  const talentMail = afterDeposit.find((s) => s.entry === "booking.reserved.talent" && s.channel === "email")!;
  assert.doesNotMatch(talentMail.html, /\$300|\$700|Deposit paid/, "the talent notice carries no client money");
  assert.ok(afterDeposit.some((s) => s.entry === "booking.reserved.talent" && s.channel === "in_app"), "talent in-app notice");

  await dispatchEventNotifications(confirmed, { ctx, handlers });
  assert.ok(forEntries(sent, "booking.confirmed.client").length >= 1, "the balance sends the confirmation");
  assert.equal(forEntries(sent, "booking.reserved").length, afterDeposit.length, "the balance sends no second 'reserved'");

  const total = sent.length;
  await dispatchEventNotifications(reserved, { ctx, handlers });
  await dispatchEventNotifications(confirmed, { ctx, handlers });
  assert.equal(sent.length, total, "a replayed event adds nothing");
});

test("ES: the deposit notice is 'Reserva apartada' with the deposit and the balance", async () => {
  const sent: Sent[] = [];
  const ctx = inquiryDb("es");
  const ev = buildBookingReservedEvent({ tenantId: "t1", inquiryId: "inq1", bookingId: "b1", depositCents: 30000, currency: "MXN" });
  await dispatchEventNotifications(ev, { ctx, handlers: makeHandlers(sent) });
  const mail = sent.find((s) => s.entry === "booking.reserved.client" && s.channel === "email")!;
  assert.match(mail.html, /Reserva apartada/);
  assert.match(mail.html, /Anticipo pagado/);
  assert.match(mail.html, /Saldo pendiente/);
});
