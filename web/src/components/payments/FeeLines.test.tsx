import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import {
  PASS_THROUGH_DEFAULT_TAKE_BPS,
  processorFeeRatesForCurrency,
} from "@/lib/billing/commission";
import { previewFeeLines } from "@/lib/billing/fee-payer-setting";

import { EngineFeeLines, FeeLines } from "./FeeLines";

const US = processorFeeRatesForCurrency("USD");
const preview = (feePayer: "seller" | "client") =>
  previewFeeLines({
    price: 100,
    currency: "USD",
    feePayer,
    takeBps: PASS_THROUGH_DEFAULT_TAKE_BPS,
    processorFeeRates: US,
  });

test("seller mode: no card processing line, shows total and non-refundable note", () => {
  const html = renderToStaticMarkup(<FeeLines lines={preview("seller")} />);
  assert.match(html, /Service/);
  assert.match(html, /Platform fee \(1\.5%\)/);
  assert.match(html, /\$101\.50/);
  assert.doesNotMatch(html, /Card processing/);
  assert.match(html, /Fees are non-refundable\./);
});

test("client mode: card processing line and grossed-up total", () => {
  const html = renderToStaticMarkup(<FeeLines lines={preview("client")} estimate />);
  assert.match(html, /Card processing/);
  assert.match(html, /about \$104\.84/);
});

test("EngineFeeLines renders engine codes via the label map, total strong, non-refundable note", () => {
  const html = renderToStaticMarkup(
    <EngineFeeLines
      currency="USD"
      lines={[
        { code: "service_subtotal", cents: 10000 },
        { code: "platform_fee", cents: 150 },
        { code: "processing_fee", cents: 334 },
        { code: "total_charged", cents: 10484 },
      ]}
      label={(c) => `L:${c}`}
      nonRefundable="Fees are non-refundable."
    />,
  );
  assert.match(html, /L:processing_fee/);
  assert.match(html, /\$104\.84/);
  assert.match(html, /data-fee-line="total_charged" class="[^"]*font-semibold/);
  assert.match(html, /Fees are non-refundable\./);
  assert.equal(renderToStaticMarkup(<EngineFeeLines currency="USD" lines={[]} label={String} nonRefundable="x" />), "");
});
