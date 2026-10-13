import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { ReceiptPageView, type ReceiptPageModel } from "./receipt-page-view";

const base: ReceiptPageModel = {
  locale: "es",
  isRefunded: false,
  createdAtLabel: "hoy",
  totalLabel: "$1",
  eventHref: null,
  discountLabel: null,
  lines: [],
  admissions: [],
};

test("a signed-out guest sees Guarda tus reservas with a link into client sign-in", () => {
  const html = renderToStaticMarkup(<ReceiptPageView {...base} signedIn={false} />);
  assert.match(html, /Guarda tus reservas/);
  assert.match(html, /href="\/login\?as=client&amp;next=%2Faccount"/);
});

test("English receipt says Save your bookings", () => {
  assert.match(renderToStaticMarkup(<ReceiptPageView {...base} locale="en" signedIn={false} />), /Save your bookings/);
});

test("a signed-in client (or an unknown state) sees no block", () => {
  assert.doesNotMatch(renderToStaticMarkup(<ReceiptPageView {...base} signedIn={true} />), /data-save-bookings/);
  assert.doesNotMatch(renderToStaticMarkup(<ReceiptPageView {...base} signedIn={null} />), /data-save-bookings/);
  assert.doesNotMatch(renderToStaticMarkup(<ReceiptPageView {...base} />), /data-save-bookings/);
});
