import test from "node:test";
import assert from "node:assert/strict";
import { CHOOSE_COPY, FLOW_STEP_OF, FLOW_TOTAL, defaultFlowLocale, flowStepOf, flowUrl } from "./flow";
import { isModuleStep, type ModuleStep } from "./module-state";

test("every module step maps into exactly one of the 4 steps; fork is gone", () => {
  const steps = Object.keys(FLOW_STEP_OF) as ModuleStep[];
  for (const s of steps) {
    assert.ok(isModuleStep(s), s);
    assert.ok([1, 2, 3, 4].includes(FLOW_STEP_OF[s]), s);
  }
  assert.equal(steps.includes("fork" as ModuleStep), false);
  assert.equal(isModuleStep("fork"), false);
  assert.equal(FLOW_TOTAL, 4);
});

test("step mapping follows the ticket", () => {
  assert.equal(flowStepOf("choose"), 1);
  for (const s of ["entry", "listening", "confirmWords", "tooLittle", "reading", "understood"] as const) assert.equal(flowStepOf(s), 2, s);
  for (const s of ["essentials", "question", "style", "readyToBuild"] as const) assert.equal(flowStepOf(s), 3, s);
  for (const s of ["save", "code", "building", "arrival"] as const) assert.equal(flowStepOf(s), 4, s);
});

test("locale default: Spanish for es-* and Mexico, saved choice wins", () => {
  assert.equal(defaultFlowLocale({ acceptLanguage: "es-MX,es;q=0.9,en;q=0.8" }), "es");
  assert.equal(defaultFlowLocale({ acceptLanguage: "es" }), "es");
  assert.equal(defaultFlowLocale({ acceptLanguage: "en-US,en;q=0.9", country: "MX" }), "es");
  assert.equal(defaultFlowLocale({ acceptLanguage: "en-US,en;q=0.9", country: "US" }), "en");
  assert.equal(defaultFlowLocale({ acceptLanguage: "en-US", saved: "es" }), "es");
  assert.equal(defaultFlowLocale({ acceptLanguage: "es-MX", saved: "en" }), "en");
  assert.equal(defaultFlowLocale({ saved: "fr" }), "en");
  assert.equal(defaultFlowLocale({}), "en");
});

test("screen 1 copy: both languages, labels match the ticket, no em dashes", () => {
  assert.equal(CHOOSE_COPY.es.title, "¿Cómo trabajas?");
  assert.equal(CHOOSE_COPY.en.progress(1), "YOUR START · 1/4");
  assert.equal(CHOOSE_COPY.es.progress(1), "TU INICIO · 1/4");
  assert.equal(CHOOSE_COPY.en.step(2), "Step 2 of 4");
  assert.equal(CHOOSE_COPY.es.step(2), "Paso 2 de 4");
  const text = JSON.stringify([CHOOSE_COPY.en, CHOOSE_COPY.es].map((c) => ({ ...c, progress: c.progress(1), step: c.step(1) })));
  assert.ok(!text.includes("—"));
  assert.ok(!/can'?t change it later/i.test(text));
});

test("flow url carries the choice, never ?start=unknown", () => {
  assert.equal(flowUrl(), "/start");
  assert.equal(flowUrl({ choice: "studio", promo: "SUMMER25", locale: "es" }), "/start?choice=studio&promo=SUMMER25&lang=es");
  assert.ok(!flowUrl({ promo: "<x>" }).includes("promo"));
});
