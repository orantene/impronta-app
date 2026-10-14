import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { heroScrollCueLabel } from "./hero-scroll-cue-label";

describe("heroScrollCueLabel (TUL-711)", () => {
  it("reads Spanish for es and es-MX", () => {
    assert.equal(heroScrollCueLabel("es"), "Desplázate");
    assert.equal(heroScrollCueLabel("es-MX"), "Desplázate");
  });
  it("reads English otherwise or when no locale is known", () => {
    assert.equal(heroScrollCueLabel("en"), "Scroll");
    assert.equal(heroScrollCueLabel(undefined), "Scroll");
  });
});
