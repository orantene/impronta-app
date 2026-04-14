import test from "node:test";
import assert from "node:assert/strict";

import { resolveLocationSlugFromQuery } from "@/lib/ai/resolve-location-from-query";

test("resolveLocationSlugFromQuery matches single-word city slug in query", () => {
  const slugs = new Set(["ibiza", "madrid", "barcelona"]);
  assert.equal(resolveLocationSlugFromQuery("blond from ibiza", slugs), "ibiza");
  assert.equal(resolveLocationSlugFromQuery("IBIZA models", slugs), "ibiza");
  assert.equal(resolveLocationSlugFromQuery("talent en Ibiza por favor", slugs), "ibiza");
});

test("resolveLocationSlugFromQuery matches hyphenated slug to consecutive words", () => {
  const slugs = new Set(["playa-del-carmen", "cancun"]);
  assert.equal(
    resolveLocationSlugFromQuery("hostess playa del carmen", slugs),
    "playa-del-carmen",
  );
  assert.equal(resolveLocationSlugFromQuery("modelo rubia cancun", slugs), "cancun");
});

test("resolveLocationSlugFromQuery uses token aliases when slug exists", () => {
  const slugs = new Set(["ibiza", "playa-del-carmen"]);
  assert.equal(resolveLocationSlugFromQuery("talent from eivissa", slugs), "ibiza");
  assert.equal(resolveLocationSlugFromQuery("event in pdc", slugs), "playa-del-carmen");
});

test("resolveLocationSlugFromQuery maps ibiza token to eivissa slug when only eivissa exists", () => {
  assert.equal(resolveLocationSlugFromQuery("blond from ibiza", new Set(["eivissa"])), "eivissa");
});

test("resolveLocationSlugFromQuery returns empty when slug not in catalog", () => {
  assert.equal(resolveLocationSlugFromQuery("blond from ibiza", new Set(["madrid"])), "");
});

test("resolveLocationSlugFromQuery ignores very short single-part slugs", () => {
  assert.equal(resolveLocationSlugFromQuery("go to la land", new Set(["la"])), "");
});

test("resolveLocationSlugFromQuery maps playa token to playa-del-carmen when present", () => {
  assert.equal(
    resolveLocationSlugFromQuery("fitness male playa", new Set(["playa-del-carmen", "cancun"])),
    "playa-del-carmen",
  );
});
