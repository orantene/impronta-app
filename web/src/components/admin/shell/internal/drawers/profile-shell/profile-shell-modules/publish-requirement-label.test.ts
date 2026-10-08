import assert from "node:assert/strict";
import { test } from "node:test";
import { addRequirementText, publishRequirementLabel } from "./publish-requirement-label";

const t = (v: string) => ({ "1 language": "1 idioma", "a bio": "una biografía" } as Record<string, string>)[v] ?? v;

test("counted photo labels localize with plural", () => {
  assert.equal(publishRequirementLabel("1 more photo", t, true), "1 foto más");
  assert.equal(publishRequirementLabel("2 more photos", t, true), "2 fotos más");
});
test("static labels go through the dictionary; English is untouched", () => {
  assert.equal(addRequirementText("1 language", t, true), "Agregar 1 idioma");
  assert.equal(addRequirementText("1 language", t, false), "Add 1 language");
});
