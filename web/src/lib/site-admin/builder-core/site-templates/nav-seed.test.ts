import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { COMPONENT_EMPTY_STATES } from "./copy";
import { dedupeNavItems } from "./nav-seed";

describe("TUL-979 header menu seed has no repeated links", () => {
  it("drops a second item pointing at the same href", () => {
    const out = dedupeNavItems([
      { label: "Agenda", href: "/agendar" },
      { label: "Escríbenos", href: "/contacto" },
      { label: "Agenda", href: "/agendar" },
      { label: "Contacto", href: "/Contacto" },
    ]);
    assert.deepEqual(out.map((i) => i.href), ["/agendar", "/contacto"]);
  });
  it("drops a repeated label even with a different href", () => {
    const out = dedupeNavItems([
      { label: "Escríbenos", href: "/a" },
      { label: "escríbenos", href: "/b" },
    ]);
    assert.equal(out.length, 1);
  });
});

describe("TUL-973 empty states carry both languages", () => {
  it("location_hours has distinct ES and EN lines", () => {
    const pair = COMPONENT_EMPTY_STATES.location_hours;
    assert.ok(pair.es && pair.en && pair.es !== pair.en);
  });
});
