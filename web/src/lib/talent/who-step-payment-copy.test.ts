import assert from "node:assert/strict";
import { test } from "node:test";

import {
  offeringRequiresOnlineCollect,
  whoStepPaymentCopy,
} from "./who-step-payment-copy";

test("free + in-person → studio pay copy (es/en)", () => {
  assert.match(
    whoStepPaymentCopy({
      reserveMode: "free",
      allowPayInPerson: true,
      depositPct: null,
      locale: "es",
    }),
    /estudio/,
  );
  assert.match(
    whoStepPaymentCopy({
      reserveMode: "free",
      allowPayInPerson: true,
      depositPct: null,
      locale: "en",
    }),
    /studio/i,
  );
});

test("deposit copy includes percent and never promises studio-only", () => {
  const es = whoStepPaymentCopy({
    reserveMode: "deposit",
    allowPayInPerson: false,
    depositPct: 30,
    locale: "es",
  });
  assert.match(es, /30%/);
  assert.match(es, /seña/i);
  assert.doesNotMatch(es, /estudio/);

  const en = whoStepPaymentCopy({
    reserveMode: "deposit",
    allowPayInPerson: false,
    depositPct: 30,
    locale: "en",
  });
  assert.match(en, /30%/);
  assert.match(en, /deposit/i);
  assert.doesNotMatch(en, /studio/i);
});

test("full reserve promises charge now", () => {
  assert.match(
    whoStepPaymentCopy({
      reserveMode: "full",
      allowPayInPerson: false,
      depositPct: null,
      locale: "es",
    }),
    /total ahora/,
  );
  assert.match(
    whoStepPaymentCopy({
      reserveMode: "full",
      allowPayInPerson: false,
      depositPct: null,
      locale: "en",
    }),
    /Full payment/i,
  );
});

test("online required + not ready → inquiry route copy", () => {
  const es = whoStepPaymentCopy({
    reserveMode: "deposit",
    allowPayInPerson: false,
    depositPct: 50,
    onlineCollectReady: false,
    locale: "es",
  });
  assert.match(es, /no está disponible/i);
  assert.match(es, /consulta/i);
  assert.doesNotMatch(es, /seña del/);
});

test("offeringRequiresOnlineCollect matrix", () => {
  assert.equal(
    offeringRequiresOnlineCollect({ reserveMode: "free", allowPayInPerson: true }),
    false,
  );
  assert.equal(
    offeringRequiresOnlineCollect({ reserveMode: "free", allowPayInPerson: false }),
    true,
  );
  assert.equal(
    offeringRequiresOnlineCollect({ reserveMode: "deposit", allowPayInPerson: true }),
    true,
  );
  assert.equal(
    offeringRequiresOnlineCollect({ reserveMode: "full", allowPayInPerson: true }),
    true,
  );
});
