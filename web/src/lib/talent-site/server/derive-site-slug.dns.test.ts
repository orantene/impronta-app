/**
 * Phase 2 additions to slug derivation: a site slug is now a HOSTNAME LABEL and
 * lives in a namespace shared with agency slugs, so derivation has to answer to
 * a predicate it cannot enumerate.
 *
 * The existing behaviour is covered by `derive-site-slug.test.ts`; this file
 * covers only what Phase 2 added, so the two can be read separately.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  deriveAvailableSiteSlug,
  deriveSiteSlug,
  isDnsLabel,
} from "./derive-site-slug";

test("isDnsLabel matches the CHECK constraint's regex", () => {
  for (const ok of ["a", "a1", "sofia-mendez", "x".repeat(63)]) {
    assert.equal(isDnsLabel(ok), true, ok);
  }
  for (const bad of [
    "",
    "   ",
    "-lead",
    "trail-",
    "Upper",
    "has.dot",
    "has_underscore",
    "x".repeat(64),
    null,
    undefined,
  ]) {
    assert.equal(isDnsLabel(bad), false, String(bad));
  }
});

test("deriveSiteSlug skips candidates the namespace predicate rejects", () => {
  const slug = deriveSiteSlug("Acme", null, [], (c) => c === "acme" || c === "acme-2");
  assert.equal(slug, "acme-3");
});

test("deriveSiteSlug still honours the taken set alongside the predicate", () => {
  const slug = deriveSiteSlug("Acme", null, ["acme"], (c) => c === "acme-2");
  assert.equal(slug, "acme-3");
});

test("deriveAvailableSiteSlug asks the async predicate once per real collision", async () => {
  const asked: string[] = [];
  const slug = await deriveAvailableSiteSlug("Sofia Mendez", "TAL-1", {
    isTaken: async (c) => {
      asked.push(c);
      return c === "sofia-mendez";
    },
  });
  assert.equal(slug, "sofia-mendez-2");
  assert.deepEqual(asked, ["sofia-mendez", "sofia-mendez-2"]);
});

test("deriveAvailableSiteSlug returns the first candidate when nothing is taken", async () => {
  const slug = await deriveAvailableSiteSlug("Sofia Mendez", "TAL-1", {
    isTaken: () => false,
  });
  assert.equal(slug, "sofia-mendez");
});

test("deriveAvailableSiteSlug treats a throwing predicate as taken, never as free", async () => {
  let calls = 0;
  const slug = await deriveAvailableSiteSlug("Acme", null, {
    isTaken: () => {
      calls += 1;
      if (calls === 1) throw new Error("network");
      return false;
    },
  });
  assert.equal(slug, "acme-2");
  assert.equal(calls, 2);
});

test("deriveAvailableSiteSlug always yields a DNS label, even when everything collides", async () => {
  const slug = await deriveAvailableSiteSlug("Acme", null, {
    isTaken: () => true,
    maxAttempts: 3,
  });
  assert.equal(isDnsLabel(slug), true, slug);
  assert.match(slug, /^acme/);
});

test("deriveAvailableSiteSlug with no predicate behaves like the pure helper", async () => {
  assert.equal(
    await deriveAvailableSiteSlug("Sofia Mendez", null, { taken: ["sofia-mendez"] }),
    "sofia-mendez-2",
  );
});
