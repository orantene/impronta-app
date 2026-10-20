import { test } from "node:test";
import assert from "node:assert/strict";
import { findCatalogEntries, findCatalogEntryById } from "./catalog";
import type { NotificationEvent, ResolvedRecipient } from "./types";

/**
 * TUL-391 — money + approval notification catalog slice:
 * refund.failed, payment.needs_attention, offer.pending_approval.
 */

function event(
  type: string,
  payload: Record<string, unknown>,
  extra: Partial<NotificationEvent> = {},
): NotificationEvent {
  return { type, tenantId: "tenant-1", eventId: `${type}:test`, payload, ...extra };
}

function recipient(): ResolvedRecipient {
  return {
    userId: "user-1",
    email: "owner@tulala.digital",
    displayName: "Owner",
    locale: "en",
    isPlatformAdmin: false,
    role: "workspace_member",
    dedupeId: "user-1",
  };
}

test("catalog: TUL-391 money entries are in_app-only payments on the workspace surface", () => {
  for (const id of ["refund.failed.workspace", "payment.needs_attention.workspace"] as const) {
    const entry = findCatalogEntryById(id);
    assert.ok(entry, `missing ${id}`);
    assert.equal(entry!.category, "payments");
    assert.deepEqual(entry!.defaultChannels, ["in_app"]);
    assert.equal(entry!.email, undefined);
    assert.equal(entry!.in_app!.kind, "payment");
    assert.equal(entry!.in_app!.surface, "workspace");
    assert.equal(entry!.in_app!.targetDrawer, "workspace-payments");
  }
});

test("catalog: refund.failed / payment.needs_attention triggers route to one entry each", () => {
  assert.deepEqual(findCatalogEntries("refund.failed").map((e) => e.id), [
    "refund.failed.workspace",
  ]);
  assert.deepEqual(findCatalogEntries("payment.needs_attention").map((e) => e.id), [
    "payment.needs_attention.workspace",
  ]);
});

test("catalog: refund.failed.workspace copy names amount and reason", () => {
  const entry = findCatalogEntryById("refund.failed.workspace")!;
  const body = entry.in_app!.body!(
    event("refund.failed", {
      amountCents: 150000,
      currency: "mxn",
      failureReason: "expired_or_canceled_card",
    }),
    recipient(),
  );
  // formatOrderMoney / failed-refund-attention-note (zero-decimal aware).
  assert.match(String(body), /1,500\.00 MXN/);
  assert.match(String(body), /expired_or_canceled_card/);
  assert.match(String(body), /not paid/i);
});

test("catalog: refund.failed.workspace copy is zero-decimal aware", () => {
  const entry = findCatalogEntryById("refund.failed.workspace")!;
  const body = entry.in_app!.body!(
    event("refund.failed", {
      amountCents: 4500,
      currency: "jpy",
      failureReason: "lost_or_stolen_card",
    }),
    recipient(),
  );
  assert.match(String(body), /4,500 JPY/);
  assert.doesNotMatch(String(body), /45\.00/);
});

test("catalog: payment.needs_attention title branches on reason", () => {
  const entry = findCatalogEntryById("payment.needs_attention.workspace")!;
  assert.equal(
    entry.in_app!.title(
      event("payment.needs_attention", { reason: "paid_after_cancellation" }),
      recipient(),
    ),
    "Payment needs a refund",
  );
  assert.equal(
    entry.in_app!.title(
      event("payment.needs_attention", { reason: "refund_failed" }),
      recipient(),
    ),
    "Refund needs attention",
  );
});

test("catalog: payment review flags (TUL-1283 / TUL-1284 / M2) ring in the reader's language", () => {
  const entry = findCatalogEntryById("payment.needs_attention.workspace")!;
  const es = { ...recipient(), locale: "es" };
  const cases: Array<[string, string, string]> = [
    ["amount_mismatch", "Payment amount does not match", "El monto pagado no coincide"],
    ["charge_on_inactive_row", "Payment on a cancelled booking", "Pago en una reserva cancelada"],
    ["duplicate_charge", "Possible duplicate charge", "Posible cobro duplicado"],
  ];
  for (const [reason, enTitle, esTitle] of cases) {
    const ev = event("payment.needs_attention", { reason, amountCents: 101500, currency: "mxn" });
    assert.equal(entry.in_app!.title(ev, recipient()), enTitle);
    assert.equal(entry.in_app!.title(ev, es), esTitle);
    const enBody = String(entry.in_app!.body!(ev, recipient()));
    const esBody = String(entry.in_app!.body!(ev, es));
    assert.match(enBody, /MXN/);
    assert.match(esBody, /MXN/);
    assert.notEqual(enBody, esBody);
    assert.ok(!enBody.includes("—") && !esBody.includes("—"), "no em dashes in bell copy");
  }
});

test("catalog: offer.pending_approval.workspace is approval Attention on offer.sent", () => {
  const entry = findCatalogEntryById("offer.pending_approval.workspace");
  assert.ok(entry);
  assert.equal(entry!.category, "offers");
  assert.deepEqual(entry!.defaultChannels, ["in_app"]);
  assert.deepEqual(entry!.triggers, ["offer.sent"]);
  assert.equal(entry!.in_app!.kind, "approval");
  assert.equal(entry!.in_app!.surface, "workspace");
  assert.equal(entry!.in_app!.targetDrawer, "inquiry-workspace");
  const payload = entry!.in_app!.targetPayload!(
    event("offer.sent", {}, { inquiryId: "inq-1" }),
  );
  assert.deepEqual(payload, { inquiryId: "inq-1" });
});

test("TUL-391 r2: offer.sent.talent bell deep-links to the inquiry (row was a dead end)", () => {
  const entry = findCatalogEntryById("offer.sent.talent");
  assert.ok(entry);
  assert.equal(entry!.in_app!.kind, "offer");
  assert.equal(entry!.in_app!.surface, "talent");
  assert.equal(entry!.in_app!.targetDrawer, "talent-inquiry");
  const payload = entry!.in_app!.targetPayload!(
    event("offer.sent", {}, { inquiryId: "inq-1" }),
  );
  assert.deepEqual(payload, { inquiryId: "inq-1" });
});
