import test from "node:test";
import assert from "node:assert/strict";

import {
  orderConfirmationSubject,
  renderOrderConfirmationEmail,
  type OrderConfirmationInput,
} from "./order-confirmation";

/** El Paisa's shape: pesos, Spanish, paid at the counter. */
const paisa = (over: Partial<OrderConfirmationInput> = {}): OrderConfirmationInput => ({
  locale: "es",
  noun: "pedido",
  tenantName: "El Paisa",
  customerName: "Ana",
  currency: "ARS",
  totalCents: 450000,
  collectedCents: 0,
  lines: [
    { label: "Milanesa napolitana", units: 2, totalCents: 300000 },
    { label: "Empanada de carne", units: 3, totalCents: 150000 },
  ],
  receiptUrl: "https://elpaisa.example/r/abcdefghijklmnop",
  ...over,
});

test("a peso order renders PESOS, never a bare dollar sign", () => {
  // 4500 pesos shown as "$4,500.00" is wrong by about a thousand times, and an
  // email cannot be corrected after sending.
  const html = renderOrderConfirmationEmail(paisa());
  assert.match(html, /4,500\.00 ARS/, "the total must name its currency");
  assert.doesNotMatch(html, /\$4,500/, "no dollar sign on a peso amount");
});

test("an UNPAID order never says it was paid", () => {
  // Stripe does not operate in Argentina, so paying in person is the NORMAL
  // case here. Thanking someone for a payment they have not made is worse than
  // sending nothing.
  const html = renderOrderConfirmationEmail(paisa({ collectedCents: 0 }));
  assert.match(html, /Puedes pagar al recoger/);
  assert.doesNotMatch(html, /Pagado por completo/);
  assert.match(html, /Falta pagar/);
});

test("a fully paid order says so and shows no balance", () => {
  const html = renderOrderConfirmationEmail(paisa({ collectedCents: 450000 }));
  assert.match(html, /Pagado por completo/);
  assert.doesNotMatch(html, /Falta pagar/);
});

test("a PART paid order shows what is still owed, not the total", () => {
  const html = renderOrderConfirmationEmail(paisa({ collectedCents: 100000 }));
  assert.match(html, /3,500\.00 ARS/, "the outstanding balance, not 4,500");
});

test("the tenant's own noun is used, in both languages", () => {
  assert.match(orderConfirmationSubject(paisa()), /El Paisa: pedido/);
  const en = orderConfirmationSubject(paisa({ locale: "en", noun: "table booking" }));
  assert.match(en, /El Paisa: table booking/);
});

test("a missing noun falls back per LOCALE, never to English in a Spanish email", () => {
  assert.match(orderConfirmationSubject(paisa({ noun: null })), /pedido/);
  assert.match(orderConfirmationSubject(paisa({ locale: "en", noun: null })), /order/);
  // The bug this pins: an ES email saying "order" because the fallback was a
  // single hardcoded English word.
  assert.doesNotMatch(orderConfirmationSubject(paisa({ noun: null })), /order/);
});

test("customer names and item labels are HTML escaped", () => {
  // A dish name is tenant-authored text going into an email body.
  const html = renderOrderConfirmationEmail(
    paisa({
      customerName: '<script>alert("x")</script>',
      lines: [{ label: 'Milanesa "especial" & papas', units: 1, totalCents: 100 }],
    }),
  );
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /&amp;/);
  assert.match(html, /&quot;especial&quot;/);
});

test("no em dashes in the copy", () => {
  // Repo rule for user-facing product copy.
  for (const locale of ["en", "es"] as const) {
    const html = renderOrderConfirmationEmail(paisa({ locale }));
    assert.doesNotMatch(html, /—/, `${locale} copy contains an em dash`);
  }
});

test("an anonymous order still greets, without a dangling name", () => {
  const html = renderOrderConfirmationEmail(paisa({ customerName: null }));
  assert.match(html, /Gracias\./);
  assert.doesNotMatch(html, /Gracias, \./, "no empty name left behind");
});

test("no receipt link renders no button, rather than a dead one", () => {
  // Orders created before `receipt_code` existed have none. A button to
  // nowhere is worse than no button.
  const html = renderOrderConfirmationEmail(paisa({ receiptUrl: null }));
  assert.doesNotMatch(html, /Ver tu recibo/);
  assert.doesNotMatch(html, /href="null"/);
});

test("the receipt link is the RECEIPT CODE path, not an order id", () => {
  const html = renderOrderConfirmationEmail(paisa());
  assert.match(html, /\/r\/abcdefghijklmnop/);
});

// ── Against the REAL El Paisa rows, not synthetic ones ──────────────────────
//
// The CEO asked for a test on the parsed fixture. Synthetic data proves the
// function; the fixture proves it survives a real menu — 117 rows with Spanish
// names, accents, ampersands, and peso prices in the thousands.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseRestauradminMenu } from "@/lib/menu-import/parse-restauradmin";

const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), "src/lib/menu-import/parrilla-el-paisa.fixture.json"), "utf8"),
);

test("EL PAISA FIXTURE: a real peso order renders pesos, in Spanish", () => {
  const menu = parseRestauradminMenu(FIXTURE);
  assert.equal(menu.currency, "ARS", "the fixture is an Argentine menu");

  const priced = menu.items.filter((i) => typeof i.amountCents === "number" && i.amountCents > 0);
  assert.ok(priced.length >= 3, `expected several priced items, got ${priced.length}`);

  const lines = priced.slice(0, 3).map((i) => ({
    label: i.title.es,
    units: 1,
    totalCents: i.amountCents as number,
  }));
  const total = lines.reduce((s, l) => s + l.totalCents, 0);

  const html = renderOrderConfirmationEmail({
    locale: "es",
    noun: "pedido",
    tenantName: menuTitle(),
    customerName: "Ana",
    currency: menu.currency,
    totalCents: total,
    collectedCents: 0,
    lines,
    receiptUrl: "https://example/r/abcdefghijklmnop",
  });

  // Every amount names ARS, and none wears a bare dollar sign.
  assert.match(html, /ARS/);
  assert.doesNotMatch(html, /\$\d/, "a peso amount must never render as $1,234");
  // Real dish names survive escaping with their accents intact.
  for (const l of lines) {
    const firstWord = l.label.split(/\s+/)[0]!.replace(/[&<>"']/g, "");
    assert.ok(html.includes(firstWord), `"${firstWord}" missing from the email`);
  }
  // Paying in person is the normal case for this tenant.
  assert.match(html, /Puedes pagar al recoger/);
});

test("EL PAISA FIXTURE: prices are thousands of pesos, so separators matter", () => {
  const menu = parseRestauradminMenu(FIXTURE);
  const big = menu.items.find((i) => (i.amountCents ?? 0) >= 100000);
  assert.ok(big, "expected at least one item over 1,000 pesos");
  const html = renderOrderConfirmationEmail({
    locale: "es", noun: "pedido", tenantName: "El Paisa", customerName: null,
    currency: "ARS", totalCents: big!.amountCents as number, collectedCents: 0,
    lines: [{ label: big!.title.es, units: 1, totalCents: big!.amountCents as number }],
    receiptUrl: null,
  });
  // A grouped thousands separator. Without it, 450000 reads as "4500.00" and a
  // customer cannot tell 4,500 from 45,000 at a glance.
  assert.match(html, /\d,\d{3}\.\d{2} ARS/);
});

function menuTitle(): string {
  return String((FIXTURE as { title?: unknown }).title ?? "El Paisa");
}
