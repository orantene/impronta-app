/**
 * TUL-428: the pay-link return states. Pure views, rendered to markup.
 * Run: node_modules/.bin/tsx --test src/lib/payments/pay-return-views.test.tsx
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { formatDashboardMoneyCents } from "@/lib/money/dashboard-money-format";

import { PaidView, ProcessingView } from "@/app/(public)/pay/[code]/CheckoutView";

const paid = {
  title: "Pago recibido",
  sellerLine: "Pagado a Rosa",
  lines: ["QA paid test"],
  total: formatDashboardMoneyCents(100000, "MXN", "es"),
  note: "n",
  receiptHref: "/r/abc",
  receiptLabel: "Ver recibo",
  threadHref: "/c/t/tok",
  backLabel: "Volver a la conversación",
  autoReturn: true,
  redirectingLabel: "Volviendo en {n} s",
  secondsLeft: 8,
};

test("paid: confirmation with seller, service, formatted amount, receipt and the way back", () => {
  const html = renderToStaticMarkup(<PaidView {...paid} />);
  assert.match(html, /data-pay-return="paid"/);
  assert.match(html, /Pago recibido/);
  assert.match(html, /Pagado a Rosa/);
  assert.match(html, /QA paid test/);
  assert.match(html, /\$1,000 MXN/);
  assert.match(html, /href="\/r\/abc"/);
  assert.match(html, /href="\/c\/t\/tok"[^>]*>Volver a la conversación</);
  assert.match(html, /Volviendo en 8 s/);
});

test("paid: no countdown when the link did not come from a conversation", () => {
  const html = renderToStaticMarkup(<PaidView {...paid} secondsLeft={null} threadHref={null} autoReturn={false} />);
  assert.doesNotMatch(html, /Volviendo en/);
  assert.doesNotMatch(html, /Volver a la conversación/);
});

const proc = { title: "Confirmando tu pago...", body: "Tarda unos segundos.", timeoutBody: "Sigue en verificación. No pagues de nuevo.", checkAgain: "Revisar de nuevo", total: "$1,000 MXN", threadHref: "/c/t/tok", backLabel: "Volver", timedOut: false, onCheckAgain: () => undefined };

test("processing: says confirming, never 'still open'; spinner shown", () => {
  const html = renderToStaticMarkup(<ProcessingView {...proc} />);
  assert.match(html, /Confirmando tu pago/);
  assert.match(html, /animate-spin/);
  assert.doesNotMatch(html, /Revisar de nuevo/);
});

test("processing timeout: says what to do, offers check again and the way back", () => {
  const html = renderToStaticMarkup(<ProcessingView {...proc} timedOut />);
  assert.match(html, /No pagues de nuevo/);
  assert.match(html, /Revisar de nuevo/);
  assert.match(html, /href="\/c\/t\/tok"/);
  assert.doesNotMatch(html, /animate-spin/);
});

test("the old 'still open to verify' wording is gone from the processing view and the page passes the cancel return", () => {
  const view = readFileSync("src/app/(public)/pay/[code]/CheckoutView.tsx", "utf8");
  assert.doesNotMatch(view, /public\.thread\.processing"\)/);
  const page = readFileSync("src/app/(public)/pay/[code]/pay-page.tsx", "utf8");
  assert.match(page, /\?status=cancelled/);
  assert.match(page, /cancelledReturn/);
});
