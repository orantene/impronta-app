import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { OfferCard } from "./OfferCard";
import { EN_COPY } from "./test-copy";

const base = {
  title: "Beach wedding Aug 14",
  version: 2,
  versions: [1, 2],
  forName: "Valentina Ruiz",
  affects: "Sofía Herrera, Anto",
  lines: [
    { label: "Sofía Herrera · hostess, 2 days", amount: "$1,400" },
    { label: "Anto · hostess, 2 days", amount: "$1,400" },
    { label: "Travel Cancún to Tulum, included", amount: "$0", muted: true },
  ],
  total: "$3,800",
  depositLine: { pct: "30%", amount: "$1,140" },
  validUntil: "Aug 1",
  copy: EN_COPY,
  onAction: () => {},
};

test("sent / viewed / accepted / expired / draft: pill and the one action follow the state", () => {
  const sent = renderToStaticMarkup(<OfferCard {...base} state="sent" />);
  assert.match(sent, /pill opp">Sent · v2/);
  assert.match(sent, /data-offer-action="revise"[^>]*>Revise/);
  assert.match(sent, /For Valentina Ruiz · affects Sofía Herrera, Anto/);
  assert.match(sent, /Deposit 30% to confirm · balance on the day/);
  assert.match(sent, /Valid until Aug 1 · <span class="vers"><span class="">v1<\/span><span class="on">v2<\/span>/);
  const viewed = renderToStaticMarkup(<OfferCard {...base} state="viewed" viewedAt="10:14" />);
  assert.match(viewed, /Viewed 10:14/);
  const accepted = renderToStaticMarkup(<OfferCard {...base} state="accepted" />);
  assert.match(accepted, /pill won">Accepted v2/);
  assert.match(accepted, /btn primary sm[^>]*data-offer-action="request_deposit"[^>]*>Request deposit/);
  const expired = renderToStaticMarkup(<OfferCard {...base} state="expired" />);
  assert.match(expired, /pill lost">Expired/);
  assert.match(expired, /data-offer-action="resend"[^>]*>Resend with new date/);
  const draft = renderToStaticMarkup(<OfferCard {...base} state="draft" versions={[1]} />);
  assert.match(draft, /pill ch">Draft/);
  assert.match(draft, /data-offer-action="send"[^>]*>Send offer/);
});

test("busy draft reads Sending offer; mobile grammar", () => {
  const busy = renderToStaticMarkup(<OfferCard {...base} state="draft" busy />);
  assert.match(busy, /aria-busy="true"/);
  assert.match(busy, /Sending offer/);
  const mobile = renderToStaticMarkup(<OfferCard {...base} state="viewed" variant="mobile" />);
  assert.match(mobile, /mx-card k-offer/);
});
