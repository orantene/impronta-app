import assert from "node:assert/strict";
import { test } from "node:test";

import {
  parseSheetCtaMode,
  sheetEffectiveIntent,
  sheetWhoPrimaryLabel,
  sheetWhoUsesChat,
} from "./sheet-cta-mode";

test("parseSheetCtaMode accepts the three product modes only", () => {
  assert.equal(parseSheetCtaMode("confirm_now"), "confirm_now");
  assert.equal(parseSheetCtaMode("contact"), "contact");
  assert.equal(parseSheetCtaMode("check_availability"), "check_availability");
  assert.equal(parseSheetCtaMode("instant"), null);
  assert.equal(parseSheetCtaMode(null), null);
});

test("contact and check_availability always open chat", () => {
  assert.equal(sheetWhoUsesChat("contact", "instant"), true);
  assert.equal(sheetWhoUsesChat("check_availability", "instant"), true);
  assert.equal(sheetWhoUsesChat("confirm_now", "instant"), false);
  assert.equal(sheetWhoUsesChat("confirm_now", "request"), true);
  assert.equal(sheetWhoUsesChat(null, "request"), true);
  assert.equal(sheetWhoUsesChat(null, "instant"), false);
});

test("effective intent follows chat vs confirm", () => {
  assert.equal(sheetEffectiveIntent("contact", "instant"), "request");
  assert.equal(sheetEffectiveIntent("confirm_now", "instant"), "instant");
  assert.equal(sheetEffectiveIntent("confirm_now", "request"), "request");
  assert.equal(sheetEffectiveIntent(null, "instant"), "instant");
});

test("who-step labels match Oran + mockup", () => {
  assert.equal(sheetWhoPrimaryLabel("confirm_now", "instant", "es"), "Confirmar cita");
  assert.equal(sheetWhoPrimaryLabel("confirm_now", "instant", "en"), "Confirm now");
  assert.equal(sheetWhoPrimaryLabel("contact", "instant", "es"), "Contactar");
  assert.equal(sheetWhoPrimaryLabel("contact", "instant", "en"), "Contact");
  assert.equal(sheetWhoPrimaryLabel("check_availability", "instant", "es"), "Consultar disponibilidad");
  assert.equal(sheetWhoPrimaryLabel("check_availability", "instant", "en"), "Check availability");
});
