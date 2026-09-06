import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { blankComments } from "@/lib/quality/supabase-unchecked-read";
import {
  BILLING_CURRENCY,
  displayCurrencyFromSettings,
  resolveOrderCurrency,
} from "./display-currency";

test("absent settings mean USD, not a broken currency", () => {
  for (const v of [null, undefined, {}, [], "ARS", 42]) {
    assert.equal(displayCurrencyFromSettings(v), "USD", `${JSON.stringify(v)}`);
  }
});

test("a well-formed code is taken, case and whitespace normalised", () => {
  assert.equal(displayCurrencyFromSettings({ display_currency: "ars" }), "ARS");
  assert.equal(displayCurrencyFromSettings({ display_currency: " ARS " }), "ARS");
});

test("a malformed value falls back rather than reaching orders.currency", () => {
  // `orders.currency` has CHECK ~ '^[A-Z]{3}$'. A settings typo must not turn
  // into a failed checkout at insert time.
  for (const bad of ["pesos", "AR", "ARSS", "", "$"]) {
    assert.equal(displayCurrencyFromSettings({ display_currency: bad }), "USD", bad);
  }
});

test("one currency across the lines is the order's currency", () => {
  const r = resolveOrderCurrency(["ARS", "ars", " ARS "]);
  assert.equal(r.ok && r.currency, "ARS");
});

test("an offering with no currency takes the billing default, not a refusal", () => {
  // Rows predating the column's use are not a mixed cart.
  const r = resolveOrderCurrency([null, undefined, ""]);
  assert.equal(r.ok && r.currency, BILLING_CURRENCY);
});

test("a MIXED cart is refused, never picked between", () => {
  // Summing ARS and USD under one symbol is the mixed-total bug the desk had.
  // On an order it is worse: someone is charged the result.
  const r = resolveOrderCurrency(["ARS", "USD"]);
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.reason, "mixed_currency_cart");
    assert.deepEqual(r.currencies, ["ARS", "USD"], "names both, so the refusal is actionable");
  }
});

// ── The rule, asserted as SHAPE rather than as the string "USD" ─────────────

const ORDERS = join(process.cwd(), "src/lib/orders");

test("the pipeline hardcodes no currency literal", () => {
  // Pinned as a SHAPE, not by grepping for "USD": a guard pinned to source text
  // reddened main on a clean refactor two weeks ago. This asks whether any
  // `currency:` field is assigned a bare three-letter string literal, which is
  // the defect regardless of which three letters.
  const offenders: string[] = [];
  for (const f of readdirSync(ORDERS)) {
    if (!/\.tsx?$/.test(f) || /\.test\.tsx?$/.test(f)) continue;
    const body = blankComments(readFileSync(join(ORDERS, f), "utf8"));
    for (const m of body.matchAll(/\bcurrency:\s*["']([A-Za-z]{3})["']/g)) {
      offenders.push(`${f} -> currency: "${m[1]}"`);
    }
  }
  assert.deepEqual(offenders, [], "an order's currency comes from the offering, never a literal");
});

test("BILLING stays USD, and that constant is not the display path", () => {
  // The rule's live edge: display currency must never reach a subscription,
  // commission, payout or plan summary.
  assert.equal(BILLING_CURRENCY, "USD");
  const src = blankComments(readFileSync(join(ORDERS, "display-currency.ts"), "utf8"));
  assert.doesNotMatch(src, /preferred_currency|default_currency/,
    "the display path must not read either billing-adjacent column");
});

test("A PESO TENANT STILL BILLS IN USD — the rule as a constraint, not a comment", () => {
  // The ruling's fifth requirement. Without this the separation is an
  // intention: a tenant with display_currency=ARS must show a USD plan summary.
  //
  // Asserted structurally because a plan summary needs a live subscription:
  // the display path must not READ either billing-adjacent column, and the
  // billing path must not read the display key. Two directions, because a leak
  // either way produces the same wrong number.
  const display = blankComments(
    readFileSync(join(ORDERS, "display-currency.ts"), "utf8"),
  );
  assert.doesNotMatch(display, /preferred_currency|default_currency/,
    "display must not read a billing-adjacent column");

  // Paths asserted to EXIST first: a missing file would make this test pass by
  // reading nothing, which is the vacuous-probe failure this session has
  // already hit twice.
  const billingFiles = [
    "src/lib/server-actions/workspace-plan-summary.ts",
    "src/lib/payments/stripe-connect.ts",
  ];
  for (const f of billingFiles) {
    const abs = join(process.cwd(), f);
    assert.ok(existsSync(abs), `${f} does not exist — this assertion would be vacuous`);
    const body = blankComments(readFileSync(abs, "utf8"));
    assert.doesNotMatch(body, /display_currency/,
      `${f} must not read the tenant display currency — billing stays USD`);
  }

  // And the display key resolves independently of both columns: given settings
  // that say ARS, the display answer is ARS while BILLING_CURRENCY is unmoved.
  assert.equal(displayCurrencyFromSettings({ display_currency: "ARS" }), "ARS");
  assert.equal(BILLING_CURRENCY, "USD");
});
