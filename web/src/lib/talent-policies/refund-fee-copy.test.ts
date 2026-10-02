import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DEFAULT_POLICY_ANSWERS } from "./answers";
import type { PolicyFacts } from "./facts";
import { renderPolicyText } from "./render";

const facts: PolicyFacts = {
  displayName: "Valeria",
  depositPct: 30,
  inPersonMethods: [],
  cancelHours: 24,
  where: ["studio"],
  zone: null,
  contact: { chat: true, whatsapp: false, email: false },
};

test("policy text states the card fee default and that refunds exclude card fees (EN + ES)", () => {
  const en = renderPolicyText(facts, DEFAULT_POLICY_ANSWERS, "en").text;
  const es = renderPolicyText(facts, DEFAULT_POLICY_ANSWERS, "es").text;
  assert.match(en, /card processing fee is included in the price/);
  assert.match(en, /Refunds exclude card processing fees/);
  assert.match(es, /Los reembolsos no incluyen las comisiones de procesamiento de tarjeta/);
  assert.doesNotMatch(en + es, /—/);
});

test("checkout shows the refund-fee note before Pay, and a fee line only when the client pays it", () => {
  const view = readFileSync("src/app/(public)/pay/[code]/CheckoutView.tsx", "utf8");
  assert.match(view, /data-refund-fees-note/);
  assert.ok(view.indexOf("refundFeesNote") < view.lastIndexOf("props.stripeUrl ?"));
  assert.match(view, /cardFeeCents && props\.cardFeeCents > 0/);
  for (const f of ["messages/en.json", "messages/es.json"]) {
    const j = JSON.parse(readFileSync(f, "utf8")).public.thread;
    assert.ok(j.refundFeesNote && j.cardFeeLine, f);
  }
});
