import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingAssistantDisclosureLabel,
  bookingAssistantHandoffCopy,
  normalizeBookingAssistantLocale,
  detectGuestMessageLocale,
  resolveBookingAssistantReplyLocale,
  wantsHumanBookingHelp,
} from "./handoff";

test("locale normalizes es prefix", () => {
  assert.equal(normalizeBookingAssistantLocale("es-MX"), "es");
  assert.equal(normalizeBookingAssistantLocale("en"), "en");
  assert.equal(normalizeBookingAssistantLocale(null), "en");
});

test("handoff copy has no em dash", () => {
  for (const reason of ["unsure", "human_requested", "turn_ceiling", "gated"] as const) {
    for (const locale of ["en", "es"] as const) {
      const text = bookingAssistantHandoffCopy(reason, locale);
      assert.ok(text.length > 10);
      assert.equal(text.includes("\u2014"), false);
    }
  }
});

test("wantsHumanBookingHelp en and es", () => {
  assert.equal(wantsHumanBookingHelp("please talk to a human"), true);
  assert.equal(wantsHumanBookingHelp("quiero hablar con una persona"), true);
  assert.equal(wantsHumanBookingHelp("cuanto cuesta el corte"), false);
});

test("AI disclosure labels (PM: Automated reply / Respuesta automática)", () => {
  assert.equal(bookingAssistantDisclosureLabel("en"), "Automated reply");
  assert.equal(bookingAssistantDisclosureLabel("es"), "Respuesta automática");
});

test("TUL-1154: English guest on a Spanish page gets English", () => {
  assert.equal(resolveBookingAssistantReplyLocale("Hi, how much is the haircut?", "es-MX"), "en");
});

test("TUL-1154: Spanish guest on an English page gets Spanish", () => {
  assert.equal(resolveBookingAssistantReplyLocale("Hola, ¿cuánto cuesta el corte?", "en"), "es");
});

test("TUL-1154: ambiguous message falls back to the page locale", () => {
  assert.equal(detectGuestMessageLocale("ok"), null);
  assert.equal(detectGuestMessageLocale("5"), null);
  assert.equal(resolveBookingAssistantReplyLocale("ok", "es"), "es");
  assert.equal(resolveBookingAssistantReplyLocale("ok", "en"), "en");
});
