import assert from "node:assert/strict";
import { test } from "node:test";

import { DRAWER_HELP } from "@/components/admin/shell/internal/help-registry";
import { retrieveHelpEntries } from "./help-corpus";
import { ROADMAP_PREFIX, buildGuestCorpus } from "./guest-corpus";

test("Spanish query returns non-empty grounding", () => {
  const corpus = buildGuestCorpus("es");
  const picked = retrieveHelpEntries("cuanto cuesta el plan gratis", { corpus });
  assert.ok(picked.length > 0, "Spanish visitor must not get an empty grounding set");
});

test("coming features carry the roadmap prefix", () => {
  const corpus = buildGuestCorpus("en");
  const coming = corpus.filter((e) => e.purpose.startsWith(ROADMAP_PREFIX));
  assert.ok(coming.length > 0, "at least one coming feature must be prefixed");
  for (const entry of coming) {
    assert.ok(entry.purpose.startsWith(ROADMAP_PREFIX));
  }
});

test("no DRAWER_HELP entry ever appears in the guest corpus", () => {
  const slugs = new Set(buildGuestCorpus("en").map((e) => e.slug));
  for (const key of Object.keys(DRAWER_HELP)) {
    assert.equal(slugs.has(key), false, `drawer help slug leaked: ${key}`);
  }
});
