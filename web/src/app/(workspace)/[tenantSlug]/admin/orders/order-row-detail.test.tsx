import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  DetailBody,
  formatWhen,
  lineCountLabel,
  OrdersList,
  showsRefund,
  statusLabel,
  statusPillClasses,
  type OrderRowDetailCopy,
} from "./order-row-detail";
import type { OrderListRow } from "@/lib/orders/orders-list";
import type { RefundFormCopy } from "./orders-refund-form";

const COPY: OrderRowDetailCopy = {
  colOrder: "Order",
  colCustomer: "Customer",
  colChannel: "Placed from",
  colTotal: "Total",
  colOutstanding: "Still owed",
  colStatus: "Status",
  lineCountOne: "item",
  lineCountOther: "items",
  noCustomer: "No name on file",
  openThread: "Open conversation",
  viewDetails: "View order",
  hideDetails: "Hide order",
  sectionCustomer: "Customer",
  sectionItems: "Items and totals",
  sectionPayment: "Payment and status",
  sectionInfo: "Order info",
  orderIdLabel: "Order ID",
  placedLabel: "Placed",
  collectedLabel: "Collected",
  noEmail: "No email on file",
  noThread: "No conversation yet",
  status: {
    paid: "Paid",
    pending_payment: "Awaiting payment",
    fulfilled: "Fulfilled",
    partially_refunded: "Partly refunded",
  },
};

const REFUND_COPY: RefundFormCopy = {
  refund: "Refund lines",
  effect: "What this refund does",
  confirm: "Confirm this refund",
  amount: "Amount to refund",
  amountHint: "Default is the full remaining ({max}). Lower it for a partial refund.",
  componentShare: "Split by component share",
  effects: {
    keep_entitlement: "",
    cancel_ticket: "",
    adjustment_after_service: "",
    revoke_unused_admission: "",
    refund_hybrid_component: "",
  },
  outcomes: {
    refunded: "",
    pick_a_line: "",
    not_allowed: "",
    invalid: "",
    not_found: "",
    nothing_to_refund: "",
    line_already_refunded: "",
    exceeds_captured: "",
    no_provider_charge: "",
    provider_refused: "",
    partial_failure: "",
    over_limit: "",
    unavailable: "",
  },
};

function row(overrides: Partial<OrderListRow> = {}): OrderListRow {
  return {
    id: "11111111-2222-3333-4444-555555555555",
    status: "fulfilled",
    currency: "MXN",
    totalCents: 150000,
    collectedCents: 150000,
    sourceChannel: "counter",
    createdAt: "2026-10-01T15:30:00.000Z",
    customerName: "Diego Torres",
    customerEmail: "diego@example.com",
    lineCount: 3,
    inquiryId: null,
    ...overrides,
  };
}

// ── Pure helpers ─────────────────────────────────────────────────────────

test("formatWhen: formats a known date, and falls back to the raw string on an invalid one", () => {
  const formatted = formatWhen("2026-10-01T15:30:00.000Z", "en");
  assert.match(formatted, /2026/);
  assert.match(formatted, /Oct/);
  assert.equal(formatWhen("not-a-date", "en"), "not-a-date");
});

test("showsRefund: only paid and partially_refunded show the refund form", () => {
  assert.equal(showsRefund("paid"), true);
  assert.equal(showsRefund("partially_refunded"), true);
  assert.equal(showsRefund("fulfilled"), false);
  assert.equal(showsRefund("pending_payment"), false);
  assert.equal(showsRefund("draft"), false);
});

test("statusPillClasses: pending_payment is coral, paid is green, everything else is amber", () => {
  assert.equal(statusPillClasses({ status: "pending_payment" }), "bg-admin-coral-soft text-admin-coral-deep");
  assert.equal(statusPillClasses({ status: "paid" }), "bg-admin-success-soft text-admin-green");
  assert.equal(statusPillClasses({ status: "fulfilled" }), "bg-admin-amber-soft text-admin-amber");
  assert.equal(statusPillClasses({ status: "refunded" }), "bg-admin-amber-soft text-admin-amber");
});

test("statusLabel: known status reads the copy map, unknown status falls back to the raw value", () => {
  assert.equal(statusLabel("paid", COPY), "Paid");
  assert.equal(statusLabel("some_future_status", COPY), "some_future_status");
});

test("lineCountLabel: never a bare unpluralized noun (TUL-435)", () => {
  assert.equal(lineCountLabel(1, COPY), "1 item");
  assert.equal(lineCountLabel(3, COPY), "3 items");
});

// ── DetailBody — the organized panel ────────────────────────────────────

const money = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`;
const channelLabel = (raw: string) => (raw === "counter" ? "Counter" : raw);

test("DetailBody: groups Customer, Items and totals, Payment and status, Order info — all from existing fields", () => {
  const html = renderToStaticMarkup(
    <DetailBody
      row={row()}
      locale="en"
      copy={COPY}
      refundCopy={REFUND_COPY}
      channelLabel={channelLabel}
      money={money}
      threadHref="/admin/messages/abc"
    />,
  );
  // Section titles, in order.
  const customerAt = html.indexOf(">Customer<");
  const itemsAt = html.indexOf(">Items and totals<");
  const paymentAt = html.indexOf(">Payment and status<");
  const infoAt = html.indexOf(">Order info<");
  assert.ok(customerAt >= 0 && itemsAt > customerAt && paymentAt > itemsAt && infoAt > paymentAt, "sections render in Customer -> Items -> Payment -> Info order");

  // Customer section: name and email, nothing computed.
  assert.match(html, /Diego Torres/);
  assert.match(html, /diego@example\.com/);

  // Items and totals: line count (pluralized), total, collected, outstanding —
  // all straight from the row, not recomputed here.
  assert.match(html, /3 items/);
  assert.match(html, /1500\.00 MXN/); // total
  // outstanding is 0 for a fully collected order
  assert.match(html, />0\.00 MXN</);

  // Payment and status: the status pill.
  assert.match(html, /Fulfilled/);

  // Order info: full id (not the shortened list code), placed date, channel,
  // and the conversation link.
  assert.match(html, new RegExp(row().id));
  assert.match(html, /Counter/);
  assert.match(html, /href="\/admin\/messages\/abc"/);
  assert.match(html, />Open conversation</);
});

test("DetailBody: no conversation yet when the order has no inquiry", () => {
  const html = renderToStaticMarkup(
    <DetailBody
      row={row({ inquiryId: null })}
      locale="en"
      copy={COPY}
      refundCopy={REFUND_COPY}
      channelLabel={channelLabel}
      money={money}
      threadHref={undefined}
    />,
  );
  assert.match(html, />No conversation yet</);
  assert.doesNotMatch(html, /<a /);
});

test("DetailBody: no customer on file falls back to the empty-state copy, not a blank", () => {
  const html = renderToStaticMarkup(
    <DetailBody
      row={row({ customerName: null, customerEmail: null })}
      locale="en"
      copy={COPY}
      refundCopy={REFUND_COPY}
      channelLabel={channelLabel}
      money={money}
      threadHref={undefined}
    />,
  );
  assert.match(html, />No name on file</);
  assert.match(html, />No email on file</);
});

test("DetailBody: the refund form only renders for a refundable status (paid/partially_refunded)", () => {
  // `showsRefund` gates it; verified without mounting OrdersRefundForm (which
  // needs next/navigation's router context) by checking a non-refundable
  // status never reaches that branch.
  assert.equal(showsRefund(row({ status: "fulfilled" }).status), false);
  assert.equal(showsRefund(row({ status: "paid" }).status), true);
});

// ── OrdersList — collapsed by default ───────────────────────────────────

test("OrdersList (desktop): renders the summary row collapsed; the detail panel is not in the DOM until opened", () => {
  const html = renderToStaticMarkup(
    <OrdersList
      variant="desktop"
      rows={[row()]}
      locale="en"
      copy={COPY}
      refundCopy={REFUND_COPY}
      threadHrefByInquiry={{}}
    />,
  );
  assert.match(html, /11111111/); // short order code, uppercased
  assert.match(html, /Diego Torres/);
  assert.match(html, /aria-expanded="false"/);
  assert.doesNotMatch(html, /data-testid="orders-detail-/, "panel is collapsed by default");
});

test("OrdersList (mobile): same collapsed-by-default behavior as desktop", () => {
  const html = renderToStaticMarkup(
    <OrdersList
      variant="mobile"
      rows={[row()]}
      locale="en"
      copy={COPY}
      refundCopy={REFUND_COPY}
      threadHrefByInquiry={{}}
    />,
  );
  assert.match(html, /11111111/);
  assert.match(html, /3 items/);
  assert.doesNotMatch(html, /data-testid="orders-detail-/, "panel is collapsed by default");
});
