import assert from "node:assert/strict";
import { test } from "node:test";

import { DRAWER_HELP } from "@/components/admin/shell/internal/help-registry";
import { retrieveHelpEntries } from "./help-corpus";
import { ROADMAP_PREFIX, buildGuestCorpus } from "./guest-corpus";
import {
  SUPPORT_CHAT_FAIL_OPEN_BODY,
  SUPPORT_CHAT_GUEST_FAIL_OPEN_BODY,
} from "./support-chat-shared";

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

// ─── Guest fail-open copy ───────────────────────────────────────────────────
//
// A prospect on the marketing site must never be told the product is broken.
// Ticket #11 in production was a real visitor asking whether Tulala has AI
// support, who received "I'm having trouble right now" — the worst possible
// answer to that question, on the page whose job is to sell.

test("guest fail-open copy never confesses a fault", () => {
  const body = SUPPORT_CHAT_GUEST_FAIL_OPEN_BODY.toLowerCase();
  for (const bad of ["trouble", "error", "sorry", "unavailable", "down", "broken", "fail"]) {
    assert.equal(body.includes(bad), false, `guest fail-open copy leaks "${bad}": ${body}`);
  }
});

test("guest fail-open copy asks for the email and is distinct from the signed-in string", () => {
  assert.match(SUPPORT_CHAT_GUEST_FAIL_OPEN_BODY, /email/i);
  assert.notEqual(SUPPORT_CHAT_GUEST_FAIL_OPEN_BODY, SUPPORT_CHAT_FAIL_OPEN_BODY);
});

test("no em dashes in guest-facing support copy", () => {
  assert.equal(SUPPORT_CHAT_GUEST_FAIL_OPEN_BODY.includes("—"), false);
});
