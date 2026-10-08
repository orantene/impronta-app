import assert from "node:assert/strict";
import { test } from "node:test";

import {
  chooseStepContinueLabel,
  parseBookingPosture,
  parseSellingBookingSettings,
  resolveWhoPrimaryAction,
  whenStepTimeGroupLabel,
  whoPrimaryCtaLabel,
  whoStepPrimaryLabel,
} from "./selling-booking-settings";

test("parse defaults when selling_defaults is empty", () => {
  assert.deepEqual(parseSellingBookingSettings(null), {
    bufferBeforeMin: null,
    bookingPosture: "instant",
    whoPrimaryCta: "confirm_now",
  });
});

test("parse prep minutes and posture from defaults", () => {
  const s = parseSellingBookingSettings({
    bufferBeforeMin: 15.9,
    bookingPosture: "inquiry",
    whoPrimaryCta: "check_availability",
  });
  assert.equal(s.bufferBeforeMin, 15);
  assert.equal(s.bookingPosture, "inquiry");
  assert.equal(s.whoPrimaryCta, "check_availability");
});

test("WSF-B: inquiry default no longer coerces confirm_now (an explicit instant service still confirms)", () => {
  const s = parseSellingBookingSettings({
    bookingPosture: "inquiry",
    whoPrimaryCta: "confirm_now",
  });
  assert.equal(s.whoPrimaryCta, "confirm_now");
  assert.equal(resolveWhoPrimaryAction({ whoPrimaryCta: s.whoPrimaryCta, offeringIntent: "instant" }), "confirm");
  assert.equal(resolveWhoPrimaryAction({ whoPrimaryCta: s.whoPrimaryCta, offeringIntent: "request" }), "chat");
});

test("WSF-B: three default postures; legacy on_demand reads as instant; junk falls to platform instant", () => {
  assert.equal(parseBookingPosture("instant"), "instant");
  assert.equal(parseBookingPosture("request"), "request");
  assert.equal(parseBookingPosture("inquiry"), "inquiry");
  assert.equal(parseBookingPosture("on_demand"), "instant");
  assert.equal(parseBookingPosture("nope"), null);
  assert.equal(parseSellingBookingSettings({ bookingPosture: "on_demand" }).bookingPosture, "instant");
  assert.equal(parseSellingBookingSettings({ bookingPosture: "instant" }).bookingPosture, "instant");
  assert.equal(parseSellingBookingSettings({ bookingPosture: 7 }).bookingPosture, "instant");
});

test("Path A: on-demand + confirm_now + instant → confirm", () => {
  assert.equal(
    resolveWhoPrimaryAction({
      whoPrimaryCta: "confirm_now",
      offeringIntent: "instant",
    }),
    "confirm",
  );
});

test("Path B: contact / check availability / inquiry → chat", () => {
  assert.equal(
    resolveWhoPrimaryAction({
      whoPrimaryCta: "contact",
      offeringIntent: "instant",
    }),
    "chat",
  );
  assert.equal(
    resolveWhoPrimaryAction({
      whoPrimaryCta: "check_availability",
      offeringIntent: "instant",
    }),
    "chat",
  );
  assert.equal(
    resolveWhoPrimaryAction({
      whoPrimaryCta: "contact",
      offeringIntent: "instant",
    }),
    "chat",
  );
});

test("request offering never confirms even with confirm_now", () => {
  assert.equal(
    resolveWhoPrimaryAction({
      whoPrimaryCta: "confirm_now",
      offeringIntent: "request",
    }),
    "chat",
  );
});

test("labels match product vocabulary", () => {
  assert.equal(whoPrimaryCtaLabel("confirm_now", "es"), "Confirmar cita");
  assert.equal(whoPrimaryCtaLabel("confirm_now", "en"), "Confirm now");
  assert.equal(whoPrimaryCtaLabel("contact", "en"), "Contact");
  assert.equal(whoPrimaryCtaLabel("check_availability", "es"), "Consultar disponibilidad");
});

test("who-step chat under confirm_now keeps Chat now label", () => {
  assert.equal(
    whoStepPrimaryLabel({ action: "chat", whoPrimaryCta: "confirm_now", locale: "es" }),
    "Chatea ahora",
  );
  assert.equal(
    whoStepPrimaryLabel({ action: "chat", whoPrimaryCta: "contact", locale: "en" }),
    "Contact",
  );
  assert.equal(
    whoStepPrimaryLabel({ action: "confirm", whoPrimaryCta: "confirm_now", locale: "es" }),
    "Confirmar cita",
  );
});

test("AUD-004: inquiry when-step uses preferred-time vocabulary", () => {
  assert.equal(whenStepTimeGroupLabel({ action: "chat", locale: "es" }), "Horario preferido");
  assert.equal(whenStepTimeGroupLabel({ action: "chat", locale: "en" }), "Preferred time");
  assert.equal(whenStepTimeGroupLabel({ action: "confirm", locale: "es" }), "Elige un horario");
  assert.equal(
    chooseStepContinueLabel({ action: "chat", locale: "es", needsOption: false }),
    "Continuar: horario preferido",
  );
  assert.equal(
    chooseStepContinueLabel({ action: "confirm", locale: "es", needsOption: false }),
    "Continuar: elegir horario",
  );
});
