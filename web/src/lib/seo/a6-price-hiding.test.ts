import assert from "node:assert/strict";
import { test } from "node:test";

import { toAgentServices } from "@/lib/booking/agent/catalog";
import type { TalentOffering } from "@/lib/talent/offerings-types";
import { offeringsToJsonLdServices } from "./talent-json-ld";
import { talentServicePriceText } from "./talent-llms-txt";

const base = {
  kind: "service",
  title: "Gel set",
  description: "x",
  priceType: "flat_package",
  priceDisplay: "exact",
  amountCents: 90000,
  currency: "MXN",
  durationMinutes: null,
};

test("D-10a: on_request and quote offerings never leak a figure into llms.txt price text", () => {
  const onRequest = { ...base, visibility: "on_request" };
  const quote = { ...base, visibility: "public", priceDisplay: "quote" };
  for (const o of [onRequest, quote]) {
    const [svc] = offeringsToJsonLdServices([o]);
    const text = talentServicePriceText(svc!);
    assert.equal(/\d/.test(text), false, `price text leaked digits: ${text}`);
  }
});

test("D-10a: the public booking catalog hides figures for quote and on_request offerings", () => {
  const mk = (p: Partial<TalentOffering>) =>
    ({ id: "s1", ...base, visibility: "public", ...p }) as unknown as TalentOffering;
  const services = toAgentServices([mk({ priceDisplay: "quote" }), mk({ visibility: "on_request" })], "en");
  for (const s of services) {
    assert.equal(/\d/.test(s.price), false, `price label leaked digits: ${s.price}`);
    assert.equal(s.amount_cents, null, "amount_cents must be null when the price is hidden");
  }
});
