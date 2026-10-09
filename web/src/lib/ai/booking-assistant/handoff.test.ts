import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bookingAssistantDisclosureLabel,
  bookingAssistantHandoffCopy,
  normalizeBookingAssistantLocale,
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
