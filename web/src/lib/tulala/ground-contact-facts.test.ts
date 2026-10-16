import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { dropUngroundedContactFacts } from "./ground-contact-facts";

const f = (factKey: string, value: unknown) => ({ factKey, value });

describe("dropUngroundedContactFacts (TUL-1157)", () => {
  test("keeps a phone the user typed", () => {
    const out = dropUngroundedContactFacts([f("presence.whatsapp", "+529981234567")], "Mi whatsapp es 998 123 4567");
    assert.equal(out.length, 1);
  });
  test("drops an invented phone", () => {
    const out = dropUngroundedContactFacts([f("presence.whatsapp", "+529981234567"), f("work.services", ["Limpieza"])], "Limpio casas en Playa del Carmen");
    assert.deepEqual(out.map((x) => x.factKey), ["work.services"]);
  });
  test("drops an invented name, keeps a typed one case-insensitively", () => {
    assert.equal(dropUngroundedContactFacts([f("person.name", "Ana")], "Limpio casas en Playa del Carmen").length, 0);
    assert.equal(dropUngroundedContactFacts([f("person.name", "Ana")], "soy ANA y limpio casas").length, 1);
  });
  test("drops an invented email", () => {
    assert.equal(dropUngroundedContactFacts([f("presence.email", "a@b.co")], "hola").length, 0);
  });
});
