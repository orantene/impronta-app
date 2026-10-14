import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const KEYS = [
  "groupLabel",
  "monthly",
  "yearly",
  "saveUpTo",
  "savePct",
  "perMonth",
  "billedYearly",
  "billedMonthly",
  "popular",
];

test("TUL-828: interval copy exists in EN and ES, translated, no em dashes", () => {
  const en = JSON.parse(read("messages/en.json")).public.pricingInterval;
  const es = JSON.parse(read("messages/es.json")).public.pricingInterval;
  for (const k of KEYS) {
    assert.equal(typeof en[k], "string", `en ${k}`);
    assert.equal(typeof es[k], "string", `es ${k}`);
    assert.doesNotMatch(en[k] + es[k], /—/);
  }
  assert.notEqual(es.monthly, en.monthly);
  assert.match(en.saveUpTo, /\{pct\}/);
  assert.match(es.billedYearly, /\{amount\}/);
});

test("TUL-828: the ladders render inside the toggle, which defaults to monthly", () => {
  const section = read("src/components/marketing/pricing-ladders-section.tsx");
  assert.match(section, /<BillingIntervalToggle copy=\{toggleCopy\}>/);
  assert.match(section, /group-data-\[interval=year\]\/billing:block/);
  assert.match(section, /data-yearly-source=\{y\.source\}/);
  // One primary CTA per card.
  assert.equal(section.match(/<MarketingCta\b/g)?.length, 1);
  const toggle = read("src/components/marketing/billing-interval-toggle.tsx");
  assert.match(toggle, /useState<BillingInterval>\(\s*DEFAULT_BILLING_INTERVAL/);
  assert.match(toggle, /role="radiogroup"/);
});

test("TUL-828: the pricing page keeps the currency picker untouched", () => {
  assert.match(
    read("src/app/(marketing)/pricing/page.tsx"),
    /<CurrencyPicker current=\{currency\} source=\{source\} locale=\{locale\} \/>/,
  );
});
