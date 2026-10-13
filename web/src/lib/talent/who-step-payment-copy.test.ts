import assert from "node:assert/strict";
import { test } from "node:test";

import {
  doneStepNextActionCopy,
  offeringRequiresOnlineCollect,
  resolveWhoStepPaymentUi,
  whoStepConfirmCtaLabel,
  whoStepPaymentCopy,
} from "./who-step-payment-copy";
import { DEFAULT_SHEET_BOOKING_SETTINGS } from "./selling-booking-settings";

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

test("confirm CTA: studio keeps Confirmar; deposit/full say Continuar al pago", () => {
  assert.match(
    whoStepConfirmCtaLabel({
      needsOnlineCollect: false,
      locale: "es",
      whoPrimaryCta: "confirm_now",
    }),
    /Confirmar cita/,
  );
  assert.match(
    whoStepConfirmCtaLabel({
      needsOnlineCollect: true,
      locale: "es",
      whoPrimaryCta: "confirm_now",
    }),
    /Continuar al pago/,
  );
  assert.match(
    whoStepConfirmCtaLabel({
      needsOnlineCollect: true,
      locale: "en",
      whoPrimaryCta: "confirm_now",
    }),
    /Continue to payment/,
  );
});

test("resolveWhoStepPaymentUi deposit confirm uses payment CTA", () => {
  const ui = resolveWhoStepPaymentUi({
    reserveMode: "deposit",
    allowPayInPerson: false,
    depositPct: 30,
    onlineCollectReady: true,
    locale: "es",
    offeringIntent: "instant",
    bookingSettings: DEFAULT_SHEET_BOOKING_SETTINGS,
  });
  assert.equal(ui.whoAction, "confirm");
  assert.match(ui.whoCtaText, /Continuar al pago/);
  assert.doesNotMatch(ui.whoCtaText, /Confirmar cita/);
  assert.match(ui.paymentFixture, /seña del 30%/);
});

test("PAY-2: readiness request intent (no hours) hides deposit honesty on chat path", () => {
  // WSF-C hours gap → request intent. AUD-004 chat copy wins until hours exist.
  const ui = resolveWhoStepPaymentUi({
    reserveMode: "deposit",
    allowPayInPerson: false,
    depositPct: 30,
    onlineCollectReady: true,
    locale: "es",
    offeringIntent: "request",
    bookingSettings: DEFAULT_SHEET_BOOKING_SETTINGS,
  });
  assert.equal(ui.whoAction, "chat");
  assert.match(ui.whoCtaText, /Enviar consulta/);
  assert.match(ui.paymentFixture, /Te respondemos para confirmar el horario/);
  assert.doesNotMatch(ui.paymentFixture, /seña/);
});

test("AUD-004: chat/inquiry path uses reply-to-confirm copy, not studio pay", () => {
  const ui = resolveWhoStepPaymentUi({
    reserveMode: "free",
    allowPayInPerson: true,
    depositPct: null,
    locale: "es",
    offeringIntent: "request",
    bookingSettings: DEFAULT_SHEET_BOOKING_SETTINGS,
  });
  assert.equal(ui.whoAction, "chat");
  assert.match(ui.paymentFixture, /Te respondemos para confirmar el horario/);
  assert.doesNotMatch(ui.paymentFixture, /estudio/);

  const en = resolveWhoStepPaymentUi({
    reserveMode: "free",
    allowPayInPerson: true,
    depositPct: null,
    locale: "en",
    offeringIntent: "request",
    bookingSettings: {
      bookingPosture: "inquiry",
      whoPrimaryCta: "contact",
    },
  });
  assert.equal(en.whoAction, "chat");
  assert.match(en.paymentFixture, /reply to confirm the time/i);
});

test("done-step next action restates studio vs payment (never silent paid)", () => {
  assert.match(
    doneStepNextActionCopy({
      reserveMode: "free",
      allowPayInPerson: true,
      depositPct: null,
      locale: "es",
      wrote: true,
      isRequest: false,
    }),
    /estudio/,
  );
  assert.match(
    doneStepNextActionCopy({
      reserveMode: "deposit",
      allowPayInPerson: false,
      depositPct: 40,
      locale: "es",
      wrote: true,
      isRequest: false,
    }),
    /pago/,
  );
  assert.doesNotMatch(
    doneStepNextActionCopy({
      reserveMode: "deposit",
      allowPayInPerson: false,
      depositPct: 40,
      locale: "es",
      wrote: true,
      isRequest: false,
    }),
    /estudio/,
  );
});
