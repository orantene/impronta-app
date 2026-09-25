import assert from "node:assert/strict";
import { test } from "node:test";

import {
  forceRequestIntent,
  parseSellingBookingSettings,
  resolveWhoPrimaryAction,
  whoPrimaryCtaLabel,
  whoStepPrimaryLabel,
} from "./selling-booking-settings";

test("parse defaults when selling_defaults is empty", () => {
  assert.deepEqual(parseSellingBookingSettings(null), {
    bufferBeforeMin: null,
    bookingPosture: "on_demand",
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

test("inquiry posture coerces confirm_now to contact", () => {
  const s = parseSellingBookingSettings({
    bookingPosture: "inquiry",
    whoPrimaryCta: "confirm_now",
  });
  assert.equal(s.whoPrimaryCta, "contact");
});

test("Path A: on-demand + confirm_now + instant → confirm", () => {
  assert.equal(
    resolveWhoPrimaryAction({
      bookingPosture: "on_demand",
      whoPrimaryCta: "confirm_now",
      offeringIntent: "instant",
    }),
    "confirm",
  );
});

test("Path B: contact / check availability / inquiry → chat", () => {
  assert.equal(
    resolveWhoPrimaryAction({
      bookingPosture: "on_demand",
      whoPrimaryCta: "contact",
      offeringIntent: "instant",
    }),
    "chat",
  );
  assert.equal(
    resolveWhoPrimaryAction({
      bookingPosture: "on_demand",
      whoPrimaryCta: "check_availability",
      offeringIntent: "instant",
    }),
    "chat",
  );
  assert.equal(
    resolveWhoPrimaryAction({
      bookingPosture: "inquiry",
      whoPrimaryCta: "contact",
      offeringIntent: "instant",
    }),
    "chat",
  );
});

test("request offering never confirms even with confirm_now", () => {
  assert.equal(
    resolveWhoPrimaryAction({
      bookingPosture: "on_demand",
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
  assert.equal(forceRequestIntent("inquiry"), true);
  assert.equal(forceRequestIntent("on_demand"), false);
});

test("who-step chat under confirm_now keeps Chat now label", () => {
  assert.equal(
    whoStepPrimaryLabel({ action: "chat", whoPrimaryCta: "confirm_now", locale: "es" }),
    "Chateá ahora",
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
