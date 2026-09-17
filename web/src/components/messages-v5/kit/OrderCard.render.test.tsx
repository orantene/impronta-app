import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { OrderCard } from "./OrderCard";
import { EN_COPY } from "./test-copy";

const lines = [
  { label: "Pepperoni L · extra cheese", amount: "$19.50", proposedBy: "client" as const },
  { label: "Quattro Formaggi L", amount: "$21.00", proposedBy: "client" as const },
  { label: "Garlic bread", amount: "$8.00", proposedBy: "staff" as const },
];

test("shared draft: version pill, both-edit sentence, who proposed each line, pickup total, Draft ladder, Edit + Confirm", () => {
  const html = renderToStaticMarkup(<OrderCard mode="draft" title="Basket" clientName="Diego" version={4} lines={lines} total="$48.50" pickupLabel="7:40 PM" step="draft" copy={EN_COPY} foot="v3 by Diego 6:58 · v4 by you 7:01" onAction={() => {}} />);
  assert.match(html, /card k-order" data-card="order"/);
  assert.match(html, /class="cat">Shared draft</);
  assert.match(html, /pill ch">v4 · not an order yet/);
  assert.match(html, /Diego and you both edit · nothing is charged until you confirm/);
  assert.match(html, /lineflag client">Diego chose/);
  assert.match(html, /lineflag">you added/);
  assert.match(html, /Total · pickup 7:40 PM/);
  assert.match(html, /<b>Draft<\/b>/);
  assert.match(html, /class="stop">Confirmed</);
  assert.match(html, /data-order-action="edit"/);
  assert.match(html, /btn primary sm[^>]*data-order-action="confirm"[^>]*>Confirm order/);
});

test("busy confirm reads Confirming; a paid order shows Paid + Preparing pills, Mark picked up; fulfilled has no action", () => {
  const busy = renderToStaticMarkup(<OrderCard mode="draft" title="Basket" clientName="Diego" lines={lines} total="$48.50" step="draft" copy={EN_COPY} busy onAction={() => {}} />);
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, />Confirming</);
  const order = renderToStaticMarkup(<OrderCard mode="order" title="#1203" clientName="Diego Torres · pickup at the counter" lines={[]} total="$48.50" step="paid" paymentState="paid" fulfilmentState="preparing" copy={EN_COPY} foot="Receipt sent to WhatsApp" onAction={() => {}} />);
  assert.match(order, /card k-order me/);
  assert.match(order, /pill money">Paid/);
  assert.match(order, /pill due">Preparing/);
  assert.match(order, /data-order-action="mark_picked_up"/);
  const done = renderToStaticMarkup(<OrderCard mode="order" title="#1203" clientName="Diego" lines={[]} total="$48.50" step="fulfilled" paymentState="paid" fulfilmentState="fulfilled" copy={EN_COPY} onAction={() => {}} />);
  assert.doesNotMatch(done, /data-order-action/);
  assert.match(done, /<b>Fulfilled<\/b>/);
});
