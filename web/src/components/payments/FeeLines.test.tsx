import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { previewFeeLines } from "@/lib/billing/fee-payer-setting";

import { FeeLines } from "./FeeLines";

test("seller mode: no card processing line, shows total and non-refundable note", () => {
  const html = renderToStaticMarkup(
    <FeeLines lines={previewFeeLines({ price: 100, currency: "USD", feePayer: "seller" })} />,
  );
  assert.match(html, /Service/);
  assert.match(html, /Platform fee \(1\.5%\)/);
  assert.match(html, /\$101\.50/);
  assert.doesNotMatch(html, /Card processing/);
  assert.match(html, /Fees are non-refundable\./);
});

test("client mode: card processing line and grossed-up total", () => {
  const html = renderToStaticMarkup(
    <FeeLines lines={previewFeeLines({ price: 100, currency: "USD", feePayer: "client" })} estimate />,
  );
  assert.match(html, /Card processing/);
  assert.match(html, /about \$104\.8[34]/);
});
