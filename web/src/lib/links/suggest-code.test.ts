import test from "node:test";
import assert from "node:assert/strict";

import { slugifyForCode, suggestCode } from "./suggest-code";
import { CODE_PATTERN } from "./code";

test("a name becomes a code an operator would recognise on a card", () => {
  assert.equal(suggestCode("Orlando's chair", []), "orlando-s-chair");
  assert.equal(suggestCode("Table 7", []), "table-7");
  assert.equal(suggestCode("Front door", []), "front-door");
});

test("accents are FOLDED, not dropped", () => {
  // "Salón" -> "salon". Dropping the accented letter gives "saln", which is
  // unrecognisable to the operator who named the thing.
  assert.equal(slugifyForCode("Salón"), "salon");
  assert.equal(slugifyForCode("Café Rizo"), "cafe-rizo");
  assert.equal(slugifyForCode("Niño"), "nino");
});

test("every suggestion satisfies the database's code format", () => {
  for (const name of ["Table 7", "Salón VIP", "  spaced  out  ", "A", "Orlando's chair"]) {
    const code = suggestCode(name, []);
    if (code !== null) assert.match(code, CODE_PATTERN, `${name} -> ${code}`);
  }
});

test("a collision gets a NUMBER, not a random suffix", () => {
  // "orlando-chair-2" tells an operator there are two. "orlando-chair-k7f"
  // tells them nothing and looks like a mistake.
  assert.equal(suggestCode("Orlando chair", ["orlando-chair"]), "orlando-chair-2");
  assert.equal(suggestCode("Orlando chair", ["orlando-chair", "orlando-chair-2"]), "orlando-chair-3");
});

test("collision matching is case-insensitive, because the index is on lower(code)", () => {
  assert.equal(suggestCode("Table 7", ["TABLE-7"]), "table-7-2");
});

test("a name that cannot make a code returns NULL rather than an invented one", () => {
  // A code is going to be PRINTED. Inventing one silently gives the operator a
  // card carrying something they do not recognise.
  assert.equal(suggestCode("🎉🎉🎉", []), null);
  assert.equal(suggestCode("   ", []), null);
  assert.equal(suggestCode("", []), null);
});

test("no name is refused for colliding with a route, because none can", () => {
  // A first draft reserved "q", "admin", "api"... on the assumption a code
  // could shadow a route. It cannot: every code lives under /q/<code>, so
  // /q/admin and /q/q shadow nothing. The guard refused good names — a bar
  // whose private room is called "Q" would have been told its name is unusable.
  assert.equal(suggestCode("Q", []), "q");
  assert.equal(suggestCode("admin", []), "admin");
});

test("a long name is truncated but never left with a trailing hyphen", () => {
  const code = suggestCode("The absolutely enormous garden terrace table number twelve", []);
  assert.ok(code && code.length <= 24, `too long: ${code}`);
  assert.doesNotMatch(code!, /-$/, "trailing hyphen would fail links_code_format");
  assert.match(code!, CODE_PATTERN);
});

test("truncation still leaves room for the collision number", () => {
  const long = "The absolutely enormous garden terrace";
  const first = suggestCode(long, [])!;
  const second = suggestCode(long, [first])!;
  assert.ok(second.length <= 24, `too long: ${second}`);
  assert.match(second, CODE_PATTERN);
  assert.notEqual(second, first);
});

test("it gives up rather than looping forever when everything is taken", () => {
  const taken = ["x", ...Array.from({ length: 99 }, (_, i) => `x-${i + 2}`)];
  assert.equal(suggestCode("x", taken), null);
});
