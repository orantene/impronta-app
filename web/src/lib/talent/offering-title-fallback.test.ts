import assert from "node:assert/strict";
import test from "node:test";

import { platformServiceTitle } from "./offering-title-fallback";

test("Semi-permanent gel resolves to Spanish for an ES visitor (TUL-189)", () => {
  assert.equal(platformServiceTitle("Semi-permanent gel", "es"), "Gel semipermanente");
  assert.equal(platformServiceTitle("SEMI-PERMANENT GEL", "es"), "Gel semipermanente");
  assert.equal(platformServiceTitle("Semi-permanent gel", "en"), "Semi-permanent gel");
});

test("unknown or blank titles stay null (talent's own words win later)", () => {
  assert.equal(platformServiceTitle("My secret set", "es"), null);
  assert.equal(platformServiceTitle("  ", "es"), null);
  assert.equal(platformServiceTitle(null, "es"), null);
});

test("brand names that stay the same in both languages are not in the dictionary", () => {
  assert.equal(platformServiceTitle("Soft Gel", "es"), null);
  assert.equal(platformServiceTitle("Acrygel", "es"), null);
  assert.equal(platformServiceTitle("Rubber Gel", "es"), null);
});

test("accent-insensitive match still returns the accented Spanish form", () => {
  assert.equal(platformServiceTitle("Gel semipermanente", "es"), "Gel semipermanente");
  assert.equal(platformServiceTitle("Gel semipermanente", "en"), "Semi-permanent gel");
});
