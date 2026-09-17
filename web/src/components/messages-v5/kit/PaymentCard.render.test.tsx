import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PaymentCard, type PaymentCardState } from "./PaymentCard";
import { EN_COPY } from "./test-copy";

const base = { label: "Deposit · Beach wedding", amount: "$1,140", payerName: "Valentina Ruiz", copy: EN_COPY, onAction: () => {} };

const EXPECT: Record<PaymentCardState, [RegExp, RegExp, string]> = {
  requested: [/pill due">Request sent/, /Link sent · expires in 48h/, "copy_link"],
  opened: [/pill opp">Opened/, /Client is on the pay page/, "wait"],
  paid: [/pill money">Paid/, /Card · receipt sent/, "view_receipt"],
  failed: [/pill fail">Failed/, /Card declined at the provider · nothing charged/, "new_link"],
  expired: [/pill lost">Expired/, /Link expired Aug 2/, "new_link"],
  refunded: [/pill ch">Refunded/, /\$1,140 back to the card · 5 to 10 days/, "view_refund"],
  partially_refunded: [/pill ch">Partly refunded/, /\$400 refunded · the rest stays paid/, "view_refund"],
  unknown: [/pill due">Payment status unknown/, /Do not request again · checking with the provider/, "check"],
};

for (const [state, [pill, foot, action]] of Object.entries(EXPECT) as [PaymentCardState, [RegExp, RegExp, string]][]) {
  test(`payment ${state}: pill, footer sentence, one action`, () => {
    const html = renderToStaticMarkup(<PaymentCard {...base} state={state} expiredOn="Aug 2" refundAmount={state === "partially_refunded" ? "$400" : null} />);
    assert.match(html, /card k-pay me/);
    assert.match(html, pill);
    assert.match(html, foot);
    assert.match(html, new RegExp(`data-payment-action="${action}"`));
    assert.match(html, /Paid by Valentina Ruiz/);
    assert.match(html, /class="li"><span>Amount<\/span><span>\$1,140<\/span>/);
  });
}

test("ladder: bold up to the state; failed marks the last stop; refunded and unknown show no ladder", () => {
  const opened = renderToStaticMarkup(<PaymentCard {...base} state="opened" />);
  assert.match(opened, /<b>Request sent<\/b>/);
  assert.match(opened, /<b>Opened<\/b>/);
  assert.match(opened, /class="stop">Paid</);
  const failed = renderToStaticMarkup(<PaymentCard {...base} state="failed" />);
  assert.match(failed, /class="stop fail">Failed/);
  assert.doesNotMatch(renderToStaticMarkup(<PaymentCard {...base} state="refunded" />), /data-ladder/);
  assert.doesNotMatch(renderToStaticMarkup(<PaymentCard {...base} state="unknown" />), /data-ladder/);
  assert.match(renderToStaticMarkup(<PaymentCard {...base} state="requested" busy />), /aria-busy="true"/);
});
