import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PayoutBreakdownCard } from "./PayoutBreakdownCard";

test("shows gross, commission, net and the country's arrival (MX: 3 business days)", () => {
  const html = renderToStaticMarkup(<PayoutBreakdownCard currency="MXN" grossCents={100_000} netCents={100_000} payoutCountry="MX" />);
  assert.match(html, /data-payout-line="gross"/);
  assert.match(html, /data-payout-line="commission"/);
  assert.match(html, /data-payout-line="net"/);
  assert.match(html, /3 business days after the client pays/);
  assert.match(html, /7 to 14 days/);
  assert.doesNotMatch(html, /recipient|24 hours/);
  assert.doesNotMatch(html, /data-payout-line="other"/);
});

test("US 2 days, CA 3 days, and an other-deductions line when net < gross", () => {
  const us = renderToStaticMarkup(<PayoutBreakdownCard currency="USD" grossCents={10_000} netCents={8_000} payoutCountry="US" />);
  assert.match(us, /2 business days after the client pays/);
  assert.match(us, /data-payout-line="other"/);
  const ca = renderToStaticMarkup(<PayoutBreakdownCard currency="USD" grossCents={10_000} netCents={10_000} payoutCountry="CA" />);
  assert.match(ca, /3 business days after the client pays/);
});

test("unknown payout country states no number of business days", () => {
  const html = renderToStaticMarkup(<PayoutBreakdownCard currency="USD" grossCents={10_000} netCents={10_000} />);
  assert.doesNotMatch(html, /business days/);
  assert.match(html, /standard schedule for your country/);
  assert.match(html, /7 to 14 days/);
});

test("renders nothing when the figures cannot add up", () => {
  assert.equal(renderToStaticMarkup(<PayoutBreakdownCard currency="USD" grossCents={100} netCents={200} />), "");
});
