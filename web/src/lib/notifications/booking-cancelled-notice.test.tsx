/**
 * TUL-1268 item 3: the cancel notice reaches client, talent and coordinator in
 * EN and ES, names the service and date, and carries a display-only refund line.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { bookingRefundLine, cancelledByLine } from "./booking-cancelled-copy";
import { BOOKING_CANCELLED_CATALOG_ENTRIES } from "./catalog-entries-booking-cancelled";
import type { NotificationEvent, ResolvedRecipient } from "./types";

const event: NotificationEvent = {
  type: "booking.cancelled",
  tenantId: "t1",
  inquiryId: "inq-7",
  bookingId: "b7",
  eventId: "booking-cancelled:b7",
  payload: {
    bookingId: "b7",
    contactName: "QA Guest",
    eventDate: "mié 14 oct, 13:30 - 14:30",
    serviceName: "Corte de cabello",
    paidCents: 80000,
    refundCents: 80000,
    currency: "MXN",
  },
};

const who = (role: ResolvedRecipient["role"], locale: string): ResolvedRecipient => ({
  userId: "u1",
  email: "p@x.test",
  displayName: "Ana",
  locale,
  isPlatformAdmin: false,
  role,
  dedupeId: "u1",
});

function html(id: string, locale: string): string {
  const entry = BOOKING_CANCELLED_CATALOG_ENTRIES.find((e) => e.id === id)!;
  const el = entry.email!.render({
    event,
    recipient: who(id.endsWith("client") ? "client" : "workspace_member", locale),
    brand: { locale, wordmark: "T", accountName: "T", footerDomain: "t.test", homeHref: "https://t.test" },
  });
  return renderToStaticMarkup(el);
}

const IDS = ["booking.cancelled.client", "booking.cancelled.talent", "booking.cancelled.coordinator"];

test("three recipients, email + in-app", () => {
  assert.deepEqual(BOOKING_CANCELLED_CATALOG_ENTRIES.map((e) => e.id), IDS);
  for (const e of BOOKING_CANCELLED_CATALOG_ENTRIES) assert.deepEqual(e.defaultChannels, ["email", "in_app"]);
});

for (const id of IDS) {
  const talent = id.endsWith("talent");
  test(`${id}: EN shows service and date${talent ? ", never a refund line" : " and a refund line"}`, () => {
    const out = html(id, "en");
    assert.match(out, /Corte de cabello/);
    assert.match(out, /mié 14 oct/);
    if (talent) assert.doesNotMatch(out, /Refund|\$800|cancellation policy/);
    else {
      assert.match(out, /Refund/);
      assert.match(out, /800/);
    }
  });
  test(`${id}: ES shows service and date${talent ? ", never a refund line" : " and a refund line"}`, () => {
    const out = html(id, "es");
    assert.match(out, /Corte de cabello/);
    assert.match(out, /mié 14 oct/);
    if (talent) assert.doesNotMatch(out, /Reembolso|\$800|política de cancelación/);
    else {
      assert.match(out, /Reembolso/);
      assert.match(out, /800/);
    }
  });
}

test("client copy is in the client's voice, staff copy is not", () => {
  const client = html("booking.cancelled.client", "en");
  assert.match(client, /Your booking for Corte de cabello has been cancelled/);
  assert.doesNotMatch(client, /Refund to the client|talent|roster|agency/i);
  const coordinator = html("booking.cancelled.coordinator", "en");
  assert.match(coordinator, /QA Guest/);
  assert.match(coordinator, /Refund to the client/);
  assert.match(html("booking.cancelled.client", "es"), /Tu reserva de Corte de cabello se canceló/);
});

test("the copy says who cancelled, or that it expired, in both languages", () => {
  const by = (audience: "client" | "workspace", locale: string, who: string) => cancelledByLine({ audience, locale, by: who });
  assert.equal(by("client", "en", "client"), "You cancelled this booking.");
  assert.equal(by("client", "en", "customer"), "You cancelled this booking.");
  assert.equal(by("client", "en", "system"), "This booking expired before it was confirmed.");
  assert.equal(by("workspace", "en", "staff"), "Cancelled by the workspace team.");
  assert.equal(by("workspace", "es", "system"), "Venció antes de confirmarse.");
  assert.equal(by("client", "es", "talent"), "El proveedor canceló esta reserva.");
  assert.equal(by("client", "en", "nope"), null);
  const out = html("booking.cancelled.client", "en");
  assert.doesNotMatch(out, /cancelled this booking/, "no byLine without cancelledBy in the payload");
});

test("in-app title and body name the service and date, in EN and ES", () => {
  for (const e of BOOKING_CANCELLED_CATALOG_ENTRIES) {
    for (const l of ["en", "es"]) {
      const body = e.in_app!.body!(event, who("client", l)) ?? "";
      assert.match(body, /Corte de cabello/);
      assert.match(body, /14 oct/);
      assert.match(body, l === "es" ? /se canceló/ : /has been cancelled/);
      assert.match(e.in_app!.title(event, who("client", l)), l === "es" ? /cancel/ : /cancelled/);
    }
  }
});

test("refund line covers refund, kept, nothing paid and unknown, in both languages, with no em dash", () => {
  const f = (paid: number | null, refund: number | null, locale: string, audience: "client" | "workspace" | "talent" = "client") =>
    bookingRefundLine({ audience, locale, paidCents: paid, refundCents: refund, currency: "MXN" });
  const g = (...a: Parameters<typeof f>) => f(...a) ?? "";
  assert.match(g(5000, 5000, "en"), /^Refund: .*50.*cancellation policy/);
  assert.match(g(5000, 0, "en"), /Refund: none/);
  assert.match(g(0, 0, "en"), /nothing to refund/);
  assert.equal(f(null, null, "en"), null, "unknown paid amount drops the line");
  assert.equal(f(null, null, "es"), null);
  assert.equal(f(5000, 5000, "en", "talent"), null, "the talent never sees the client's refund");
  assert.match(g(5000, 5000, "es"), /^Reembolso: /);
  assert.match(g(5000, 0, "es"), /Reembolso: ninguno/);
  assert.match(g(0, 0, "es"), /nada que reembolsar/);
  assert.match(g(5000, 2500, "en", "workspace"), /^Refund to the client/);
  for (const l of ["en", "es"]) for (const [p, r] of [[5000, 5000], [5000, 0], [0, 0], [null, null]] as const) {
    assert.doesNotMatch(f(p, r, l) ?? "", /—/);
  }
});
