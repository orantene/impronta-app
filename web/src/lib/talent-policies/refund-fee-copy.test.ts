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

test("policy text follows processing_fee_payer and states fees are non-refundable (EN + ES)", () => {
  const en = renderPolicyText(facts, DEFAULT_POLICY_ANSWERS, "en").text;
  const es = renderPolicyText(facts, DEFAULT_POLICY_ANSWERS, "es").text;
  assert.match(en, /card processing fee is paid by the professional/);
  assert.match(en, /fees are non-refundable/);
  assert.match(es, /las comisiones no son reembolsables/);
  const client = renderPolicyText({ ...facts, processingFeePayer: "client" }, DEFAULT_POLICY_ANSWERS, "en").text;
  assert.match(client, /card processing fee is added to your total/);
  assert.doesNotMatch(en + es + client, /—/);
});

test("checkout has one fee source: engine fee lines, with a non-refundable fallback note", () => {
  const view = readFileSync("src/app/(public)/pay/[code]/CheckoutView.tsx", "utf8");
  assert.match(view, /data-refund-fees-note/);
  assert.doesNotMatch(view, /cardFeeCents|refundFeesNote/);
  for (const f of ["messages/en.json", "messages/es.json"]) {
    const j = JSON.parse(readFileSync(f, "utf8")).public.thread;
    assert.ok(j.fees.nonRefundable, f);
    assert.ok(!j.refundFeesNote && !j.cardFeeLine, f);
  }
});
