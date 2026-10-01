import assert from "node:assert/strict";
import { test } from "node:test";

import type { RefundPolicyKey } from "@/lib/billing/commercial-terms-types";

import {
  buildBookingPolicy,
  buildPrivacyNotice,
  toPolicyLocale,
  tulalaPolicyLinks,
  type BookingPolicyInput,
} from "./policy-text";

const base: BookingPolicyInput = {
  locale: "en",
  name: "Jor Beauty",
  depositPct: 30,
  refundPolicy: "tiered",
  instantBookEnabled: false,
  acceptsPayInPerson: false,
  overrides: [],
};

function flat(doc: ReturnType<typeof buildBookingPolicy>): string {
  return doc.sections
    .flatMap((s) => [s.heading, ...s.paragraphs, ...(s.bullets ?? [])])
    .join("\n");
}

const PRESETS: Array<[RefundPolicyKey, RegExp, RegExp]> = [
  ["tiered", /14 or more days.*50%/, /14 o más días.*50%/],
  ["flexible", /48 hours before.*full refund/, /48 horas antes.*todo/],
  ["strict", /not refundable.*30 days/, /no es reembolsable.*30 días/],
  ["manual", /reviewed one by one/, /uno por uno/],
];

for (const [key, en, es] of PRESETS) {
  test(`refund preset ${key} renders in en and es`, () => {
    assert.match(flat(buildBookingPolicy({ ...base, refundPolicy: key })), en);
    assert.match(
      flat(buildBookingPolicy({ ...base, refundPolicy: key, locale: "es" })),
      es,
    );
  });
}

test("deposit wording covers none, partial and full", () => {
  assert.match(flat(buildBookingPolicy({ ...base, depositPct: 0 })), /does not ask for a deposit/);
  assert.match(flat(buildBookingPolicy({ ...base, depositPct: 30 })), /30% deposit/);
  assert.match(flat(buildBookingPolicy({ ...base, depositPct: 100 })), /full payment up front/);
});

test("card is collected by Tulala on the talent's behalf, talent never merchant of record", () => {
  const text = flat(buildBookingPolicy(base));
  assert.match(text, /Tulala collects the payment on this professional's behalf/);
  assert.doesNotMatch(text, /merchant of record/i);
});

test("cash or transfer only appears when accepted", () => {
  assert.doesNotMatch(flat(buildBookingPolicy(base)), /Cash or transfer/);
  assert.match(flat(buildBookingPolicy({ ...base, acceptsPayInPerson: true })), /Cash or transfer/);
});

test("instant vs inquiry-first booking", () => {
  assert.match(flat(buildBookingPolicy(base)), /start with an inquiry/);
  assert.match(flat(buildBookingPolicy({ ...base, instantBookEnabled: true })), /booked instantly/);
});

test("overrides render only when they carry content", () => {
  const empty = buildBookingPolicy({
    ...base,
    overrides: [
      { label: "Bridal", depositPct: null, cancelFreeHours: null, noShowFeeCents: null, currency: "USD" },
    ],
  });
  assert.equal(empty.sections.some((s) => s.id === "service-terms"), false);
  const full = buildBookingPolicy({
    ...base,
    overrides: [
      { label: "Bridal", depositPct: 50, cancelFreeHours: 72, noShowFeeCents: 5000, currency: "USD" },
    ],
  });
  assert.match(
    flat(full),
    /Bridal: 50% deposit, free cancellation up to 72 hours before, \$50\.00 no-show fee/,
  );
});

test("no em dashes in any generated copy", () => {
  for (const locale of ["en", "es"] as const) {
    for (const [key] of PRESETS) {
      assert.doesNotMatch(
        flat(buildBookingPolicy({ ...base, locale, refundPolicy: key, acceptsPayInPerson: true })),
        /—/,
      );
    }
    const priv = buildPrivacyNotice({ locale, name: "Jor" });
    assert.doesNotMatch(
      priv.sections.flatMap((s) => [...s.paragraphs, ...(s.bullets ?? [])]).join(" "),
      /—/,
    );
  }
});

test("privacy notice names the talent as recipient and states retention", () => {
  const priv = buildPrivacyNotice({ locale: "en", name: "Jor Beauty" });
  const text = priv.sections.flatMap((s) => [...s.paragraphs, ...(s.bullets ?? [])]).join("\n");
  assert.match(text, /Jor Beauty receives your inquiry/);
  assert.match(text, /24 months/);
  assert.match(text, /5 years/);
});

test("locale + links helpers", () => {
  assert.equal(toPolicyLocale("es-MX"), "es");
  assert.equal(toPolicyLocale("fr"), "en");
  assert.equal(
    tulalaPolicyLinks("https://tulala.digital/").termsUrl,
    "https://tulala.digital/legal/terms",
  );
});
