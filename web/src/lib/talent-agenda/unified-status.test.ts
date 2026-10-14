import { test } from "node:test";
import assert from "node:assert/strict";

import { effectiveBookingStatus, settleRecordChips } from "./abandoned-order";
import { deriveBookingState } from "./derive";
import { localiseSystemKind } from "@/lib/messages-v5/engine-lines";
import { pickSaleOrder } from "@/lib/messaging/sale-order-pick";
import { recordStateLabel } from "@/components/messages-v5/kit/StateTags";
import type { KitCopy } from "@/components/messages-v5/kit/copy";
import type { RecordChip } from "@/lib/messaging/types";

const now = new Date("2026-10-13T12:00:00Z");
// QA Max's failed MXN booking: booking confirmed, payment unpaid, order cancelled.
const qa = { status: "confirmed", orderStatus: "cancelled", paymentStatus: "unpaid", paidCents: 0 } as const;
const chip: RecordChip = { kind: "order", recordId: "o1", label: "order", paymentState: "opened", fulfilmentState: null };
const es = {
  payment: { opened: "Abierto", failed: "Pago fallido", expired: "Vencido", paid: "Pagado" },
  fulfilment: { cancelled: "Cancelado" },
  record: { order: "Pedido" },
} as unknown as KitCopy;

test("TUL-715: Clientes, Hoy, agenda and the inbox chip agree on a failed unpaid booking", () => {
  const booking = effectiveBookingStatus(qa);
  assert.equal(deriveBookingState({ kind: "booking", status: booking, now }), "cancelled");
  const [settled] = settleRecordChips([chip], new Map([["o1", "cancelled"]]));
  assert.equal(settled.paymentState, "failed");
  assert.equal(recordStateLabel(settled, es), "Pago fallido");
});

test("a lapsed order reads Vencido, a paid order keeps its chip", () => {
  assert.equal(settleRecordChips([chip], new Map([["o1", "expired"]]))[0].paymentState, "expired");
  const paid = { ...chip, paymentState: "paid" };
  assert.equal(settleRecordChips([paid], new Map([["o1", "cancelled"]]))[0].paymentState, "paid");
  assert.equal(settleRecordChips([chip], new Map([["o1", "pending_payment"]]))[0].paymentState, "opened");
  assert.equal(settleRecordChips([{ ...chip, kind: "appointment" }], new Map([["o1", "cancelled"]]))[0].paymentState, "opened");
});

test("the raw 'order' event line is localised to the dashboard language", () => {
  assert.equal(localiseSystemKind("order", es), "Pedido");
  assert.equal(localiseSystemKind("something_new", es), "something_new");
});

test("side panel reads the booking's own order even when it is not a messages order", () => {
  const rows = [{ id: "a", source_channel: "instant_book", created_at: "2026-10-13T23:55:00Z" }];
  assert.equal(pickSaleOrder(rows)?.id, "a");
  const both = [...rows, { id: "m", source_channel: "messages", created_at: "2026-10-13T23:00:00Z" }];
  assert.equal(pickSaleOrder(both)?.id, "m");
  assert.equal(pickSaleOrder([]), null);
});
