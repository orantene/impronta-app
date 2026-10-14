import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PayoutBreakdownCard } from "./PayoutBreakdownCard";

test("shows gross, commission, net and arrival (MXN: 3 business days)", () => {
  const html = renderToStaticMarkup(<PayoutBreakdownCard currency="MXN" grossCents={100_000} netCents={100_000} />);
  assert.match(html, /data-payout-line="gross"/);
  assert.match(html, /data-payout-line="commission"/);
  assert.match(html, /data-payout-line="net"/);
  assert.match(html, /about 3 business days/);
  assert.match(html, /24 hours later/);
  assert.doesNotMatch(html, /data-payout-line="other"/);
});

test("US uses 2 business days and an other-deductions line when net < gross", () => {
  const html = renderToStaticMarkup(<PayoutBreakdownCard currency="USD" grossCents={10_000} netCents={8_000} />);
  assert.match(html, /about 2 business days/);
  assert.match(html, /data-payout-line="other"/);
});

test("renders nothing when the figures cannot add up", () => {
  assert.equal(renderToStaticMarkup(<PayoutBreakdownCard currency="USD" grossCents={100} netCents={200} />), "");
});
