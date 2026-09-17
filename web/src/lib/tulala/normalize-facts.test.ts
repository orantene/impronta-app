import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { normalizeExtractedFacts, normalizeHoursPhrase, normalizeHoursValue, normalizePhoneValue, normalizeServiceList } from "./normalize-facts";

describe("hours phrases", () => {
  const cases: Array<[string, string | null]> = [
    ["de lunes a sábado", "Mon-Sat"],
    ["lunes a sabado de 9 a 7", "Mon-Sat 09:00-19:00"],
    ["martes a domingo de 1 a 11 de la noche", "Tue-Sun 13:00-23:00"],
    ["Mon to Sat 9am to 7pm", "Mon-Sat 09:00-19:00"],
    ["Mon-Sat", "Mon-Sat"],
    ["todos los dias de 10 a 20", "Every day 10:00-20:00"],
    ["every day", "Every day"],
    ["con cita", "By appointment"],
    ["Mon-Sat 09:00-19:00", "Mon-Sat 09:00-19:00"],
    ["lunes, martes, miercoles, jueves, viernes, sabado", "Mon-Sat"],
    ["lunes y jueves", "Mon, Thu"],
    ["cuando se pueda", null],
  ];
  for (const [input, expected] of cases) {
    test(JSON.stringify(input), () => assert.equal(normalizeHoursPhrase(input), expected));
  }

  test("a value list of bare day names collapses to one range; unreadable lines are kept", () => {
    assert.deepEqual(normalizeHoursValue(["lunes", "martes", "miercoles", "jueves", "viernes", "sabado"]), ["Mon-Sat"]);
    assert.deepEqual(normalizeHoursValue(["de lunes a viernes", "cuando se pueda"]), ["Mon-Fri", "cuando se pueda"]);
    assert.equal(normalizeHoursValue(42), 42);
  });
});

describe("phones and services", () => {
  test("E.164 kept; +52 added only with an MX hint", () => {
    assert.equal(normalizePhoneValue("+52 998 123 4567", null), "+529981234567");
    assert.equal(normalizePhoneValue("998 123 4567", "MX"), "+529981234567");
    assert.equal(normalizePhoneValue("998 123 4567", null), "998 123 4567");
    assert.equal(normalizePhoneValue("52 998 123 4567", null), "+529981234567");
  });
  test("services trimmed, deduped, capitalized", () => {
    assert.deepEqual(normalizeServiceList([" gel ", "Gel", "acrílicas", "acrilicas", ""]), ["Gel", "Acrílicas"]);
  });
  test("whole batch: the country in the batch drives the phone", () => {
    const out = normalizeExtractedFacts([
      { factKey: "person.country", value: "MX", source: "ai_inference" },
      { factKey: "presence.whatsapp", value: "998 123 4567", source: "ai_inference" },
      { factKey: "business.hours", value: ["martes a domingo de 1 a 11 de la noche"], source: "ai_inference" },
      { factKey: "business.name", value: "  Parrilla El Paisa ", source: "ai_inference" },
    ]);
    assert.equal(out[1].value, "+529981234567");
    assert.deepEqual(out[2].value, ["Tue-Sun 13:00-23:00"]);
    assert.equal(out[3].value, "  Parrilla El Paisa "); // untouched keys stay untouched
  });
});
