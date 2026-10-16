import test from "node:test";
import assert from "node:assert/strict";
import { mentionsHiddenService, tagLineFromVisibleServices } from "./live-text-services";

const es = "Soy Ana, limpiadora en Mérida. Ofrezco limpieza profunda y limpieza regular. Escríbeme.";

test("a line naming a hidden service is rebuilt from the visible ones", () => {
  const vis = { visible: ["Limpieza regular"], hidden: ["Limpieza profunda"] };
  assert.equal(mentionsHiddenService(es, vis), true);
  assert.equal(tagLineFromVisibleServices(es, vis, "es"), "Ofrezco limpieza regular.");
  assert.equal(tagLineFromVisibleServices("I offer deep cleaning.", { visible: ["Regular cleaning", "Windows"], hidden: ["Deep cleaning"] }, "en"), "I offer regular cleaning and windows.");
});

test("accents and case are ignored when matching", () => {
  assert.equal(mentionsHiddenService("OFREZCO LIMPIEZA PROFUNDA", { visible: [], hidden: ["limpieza profunda"] }), true);
  assert.equal(mentionsHiddenService("Ofrezco limpiéza profunda", { visible: [], hidden: ["Limpieza profunda"] }), true);
});

test("no visible service leaves no claim at all", () => {
  assert.equal(tagLineFromVisibleServices(es, { visible: [], hidden: ["Limpieza profunda"] }, "es"), "");
});

test("a service that is also visible, or no hidden mention, leaves the line alone", () => {
  assert.equal(tagLineFromVisibleServices(es, { visible: ["Limpieza profunda"], hidden: ["Limpieza profunda"] }, "es"), es);
  assert.equal(tagLineFromVisibleServices(es, { visible: ["A"], hidden: ["Masaje"] }, "es"), es);
  assert.equal(tagLineFromVisibleServices(es, { visible: [], hidden: [] }, "es"), es);
});
