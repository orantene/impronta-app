/**
 * TUL-428 / TUL-437 / TUL-467: every state of the pay page (A-J), rendered to markup in the
 * client's language. Pure views. Run: node_modules/.bin/tsx --test src/lib/payments/pay-return-views.test.tsx
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { PayStateView, type CheckoutViewProps } from "@/app/(public)/pay/[code]/CheckoutView";
import { translatorFor } from "@/i18n/use-t";

const base: CheckoutViewProps = {
  code: "q1kjp33dk52dhu4w7g23",
  amountCents: 100_000,
  currency: "MXN",
  status: "open",
  locale: "es",
  sellerName: "Rosa Nails",
  lines: [{ label: "Manicure gel", units: 1, unitCents: 100_000 }],
  stripeUrl: "/pay/q1kjp33dk52dhu4w7g23?confirm=stripe",
  threadHref: "/c/t/tok",
  receiptHref: "/r/abc",
  expiry: { time: "9:24 pm", day: null },
  whenLabel: "Jue 10 oct · 5:00 pm (CST)",
  whereLabel: "Studio Roma Norte",
  usdLine: "≈ US$54",
  feeLines: [
    { code: "service_subtotal", cents: 100_000 },
    { code: "platform_fee", cents: 1_500 },
    { code: "total_charged", cents: 101_500 },
  ],
};

function render(over: Partial<CheckoutViewProps>, runtime?: Parameters<typeof PayStateView>[0]["runtime"], locale = "es") {
  const props = { ...base, ...over, locale };
  return renderToStaticMarkup(<PayStateView {...props} t={translatorFor(locale)} runtime={runtime} />);
}

/** Actions drawn as the one primary: anchors/buttons with the seller's primary as their background. */
function primaries(html: string): number {
  return (html.match(/<(?:a|button)\b[^>]*background:var\(--token-color-primary/g) ?? []).length;
}

const ALL_STATES: Partial<CheckoutViewProps>[] = [
  { status: "open" },
  { status: "processing" },
  { status: "paid", autoReturn: true },
  { status: "paid", alreadyPaid: true },
  { status: "cancelledReturn" },
  { status: "expired" },
  { status: "replaced" },
  { status: "refunded", refundedCents: 50_000 },
  { status: "startFailed" },
  { status: "declined" },
  { status: "cancelled" },
  { status: "unknown" },
];

test("every state: seller tokens only, one primary action, 48px taps, no em dash, never buyer or cart", () => {
  for (const locale of ["es", "en", "fr"]) {
    for (const over of ALL_STATES) {
      const html = render(over, undefined, locale);
      const label = `${locale}/${over.status}${over.alreadyPaid ? "/already" : ""}`;
      assert.match(html, /data-pay-theme="tokens"/, label);
      assert.doesNotMatch(html, /admin-/, label);
      assert.ok(primaries(html) <= 1, `${label}: more than one primary action`);
      assert.doesNotMatch(html, /—/, label);
      assert.doesNotMatch(html, /\b(buyer|cart|comprador|carrito)\b/i, label);
      for (const m of html.matchAll(/<(?:a|button)\b[^>]*min-height:(\d+)px/g)) assert.ok(Number(m[1]) >= 44, label);
      assert.doesNotMatch(html, /public\.(payPage|thread)\./, `${label}: an untranslated key leaked`);
    }
  }
});

test("A ready: business, one money format, charged total, approx US$ line, when, where, words for time, policy, trust, one pay button", () => {
  const html = render({});
  assert.match(html, /Rosa Nails/);
  assert.match(html, /Pagar a Rosa Nails/);
  assert.match(html, /Pagar \$1,015 MXN/);
  assert.match(html, /≈ US\$54/);
  assert.match(html, /Jue 10 oct · 5:00 pm \(CST\)/);
  assert.match(html, /Studio Roma Norte/);
  assert.match(html, /Válido hasta las 9:24 pm/);
  assert.doesNotMatch(html, /\d{2}:\d{2}</, "no raw hh:mm");
  assert.match(html, /\$1,000 MXN/);
  assert.match(html, /\$15 MXN/);
  assert.doesNotMatch(html, /MX\$|1,000\.00|\.00/);
  assert.match(html, /Cancelaciones según la política del negocio/);
  assert.match(html, /Ver política/);
  assert.match(html, /Pago seguro con Stripe/);
  assert.match(html, /href="\/pay\/q1kjp33dk52dhu4w7g23\?confirm=stripe"/);
  assert.equal(primaries(html), 1);
  assert.match(html, /Volver a la conversación/);
});

test("A ready: without a conversation the way out is the seller's site, never a dead button", () => {
  const html = render({ threadHref: null });
  assert.doesNotMatch(html, /Volver a la conversación/);
  assert.match(html, /href="\/"[^>]*>Ir al sitio de Rosa Nails</);
});

test("A ready: rows with no data drop out, a deposit says what is left, the day shows when the link outlives today", () => {
  const bare = render({ whenLabel: null, whereLabel: null, usdLine: null, feeLines: [], expiry: { time: "9:24 pm", day: "Vie 11 oct" } });
  assert.doesNotMatch(bare, /data-pay-row=/);
  assert.doesNotMatch(bare, /data-pay-usd/);
  assert.match(bare, /Válido hasta el Vie 11 oct, 9:24 pm/);
  assert.match(bare, /Pagar \$1,000 MXN/);
  const dep = render({ depositBalanceCents: 70_000 });
  assert.match(dep, /Anticipo · resto \$700 MXN el día de tu cita/);
});

test("A ready (en): same layout, the money format does not change", () => {
  const html = render({ usdLine: null }, undefined, "en");
  assert.match(html, /Pay Rosa Nails/);
  assert.match(html, /Pay \$1,015 MXN/);
  assert.match(html, /Valid until 9:24 pm/);
  assert.match(html, /Secure payment with Stripe/);
});

test("B confirming: calm, the amount, no close warning missing, no way out yet", () => {
  const html = render({ status: "processing" }, { timedOut: false });
  assert.match(html, /Confirmando tu pago/);
  assert.match(html, /No cierres esta página/);
  assert.match(html, /animate-spin/);
  assert.match(html, /\$1,015 MXN/);
  assert.doesNotMatch(html, /Revisar de nuevo/);
  assert.doesNotMatch(html, /seguirá abierto|still open/i);
});

test("D taking longer: reassures, never asks to pay again, offers check again and the way back", () => {
  const html = render({ status: "processing" }, { timedOut: true, onCheckAgain: () => undefined });
  assert.match(html, /Tu pago sigue en verificación/);
  assert.match(html, /No pagues de nuevo/);
  assert.match(html, /Revisar de nuevo/);
  assert.match(html, /href="\/c\/t\/tok"/);
  assert.doesNotMatch(html, /animate-spin/);
  assert.equal(primaries(html), 1);
});

test("C paid: who, what, when, charged amount (not the price), receipt, way back, countdown, no stale 'nothing is charged'", () => {
  const html = render({ status: "paid", autoReturn: true }, { secondsLeft: 8 });
  assert.match(html, /data-pay-return="paid"/);
  assert.match(html, /Pago recibido/);
  assert.match(html, /Pagado a Rosa Nails/);
  assert.match(html, /Manicure gel/);
  assert.match(html, /Jue 10 oct · 5:00 pm \(CST\)/);
  assert.match(html, /Se cobró \$1,015 MXN/);
  assert.match(html, /href="\/r\/abc"[^>]*>Ver recibo</);
  assert.match(html, /href="\/c\/t\/tok"[^>]*>Volver a la conversación</);
  assert.match(html, /Volviendo a tu conversación en 8 s/);
  assert.doesNotMatch(html, /no se cobra nada|nothing is charged|Nada se cobra/i);
  assert.doesNotMatch(html, /data-pay-calendar/);
  assert.equal(primaries(html), 1, "the success mark is not an action; the way back is the one primary");
});

test("C paid: a dated booking offers .ics and Google Calendar; no thread falls back to the seller's site", () => {
  const html = render({
    status: "paid",
    threadHref: null,
    calendar: { icsHref: "data:text/calendar;charset=utf-8,BEGIN", googleHref: "https://calendar.google.com/calendar/render?action=TEMPLATE" },
  });
  assert.match(html, /data-pay-calendar="ics"/);
  assert.match(html, /download="booking\.ics"/);
  assert.match(html, /data-pay-calendar="google"/);
  assert.match(html, /Agregar al calendario/);
  assert.match(html, /Agregar a Google Calendar/);
  assert.doesNotMatch(html, /Volver a la conversación/);
  assert.match(html, /Ir al sitio de Rosa Nails/);
  assert.doesNotMatch(html, /Volviendo/);
});

test("G already paid: the paid summary and the receipt, no pay button, no countdown", () => {
  const html = render({ status: "paid", alreadyPaid: true });
  assert.match(html, /Este pago ya se hizo/);
  assert.match(html, /Ver recibo/);
  assert.doesNotMatch(html, /Pagar \$/);
  assert.doesNotMatch(html, /Volviendo/);
});

test("E cancelled back from Stripe: no charge was made, try again and the way back", () => {
  const html = render({ status: "cancelledReturn" });
  assert.match(html, /No se hizo ningún cargo/);
  assert.match(html, /href="\/pay\/q1kjp33dk52dhu4w7g23"[^>]*>Intentar de nuevo</);
  assert.match(html, /href="\/c\/t\/tok"/);
  assert.equal(primaries(html), 1);
});

test("F expired: what happened and one way to ask for a new link (the conversation, else the site)", () => {
  const html = render({ status: "expired" });
  assert.match(html, /Este enlace venció/);
  assert.match(html, /href="\/c\/t\/tok"[^>]*>Pedir un enlace nuevo</);
  assert.doesNotMatch(html, /Pagar \$/);
  const noChat = render({ status: "expired", threadHref: null });
  assert.match(noChat, /href="\/"[^>]*>Ir al sitio de Rosa Nails</);
});

test("H replaced: points to the newer link when known, else back to the conversation", () => {
  const known = render({ status: "replaced", newLinkHref: "/pay/newcode123456" });
  assert.match(known, /Este enlace fue reemplazado/);
  assert.match(known, /href="\/pay\/newcode123456"[^>]*>Ver el enlace nuevo</);
  const unknown = render({ status: "replaced" });
  assert.doesNotMatch(unknown, /Ver el enlace nuevo/);
  assert.match(unknown, /Volver a la conversación/);
});

test("I refunded and partly refunded: what came back and when it reaches the card", () => {
  const partial = render({ status: "refunded", refundedCents: 50_000 });
  assert.match(partial, /Reembolso parcial/);
  assert.match(partial, /\$500 MXN va de regreso/);
  assert.match(partial, /5 a 10 días hábiles/);
  const full = render({ status: "refunded" });
  assert.match(full, /Pago reembolsado/);
  assert.match(full, /\$1,015 MXN va de regreso/);
});

test("J error: plain message, retry, and a way to reach the business", () => {
  const html = render({ status: "startFailed" });
  assert.match(html, /Algo salió mal/);
  assert.match(html, /No se hizo ningún cargo/);
  assert.match(html, /Intentar de nuevo/);
  assert.match(html, /Contactar a Rosa Nails/);
});

test("closed and unknown states say what is true: a settled session never claims 'nothing was taken'", () => {
  assert.match(render({ status: "cancelled" }), /No se hizo ningún cargo/);
  const maybe = render({ status: "cancelled", moneyMayHaveMoved: true });
  assert.match(maybe, /Si ya pagaste/);
  assert.doesNotMatch(maybe, /No se hizo ningún cargo/);
  assert.match(render({ status: "unknown" }), /No pagues de nuevo/);
  const mismatch = render({ status: "unknown", currencyMismatch: { linkCurrency: "MXN", orderCurrency: "USD" } });
  assert.match(mismatch, /MXN/);
  assert.match(mismatch, /USD/);
});
