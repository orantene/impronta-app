import assert from "node:assert/strict";
import { test } from "node:test";

import { DRAWER_HELP } from "@/components/admin/shell/internal/help-registry";
import { retrieveHelpEntries } from "./help-corpus";
import { ROLE_LABELS } from "@/lib/marketing/help-guides";
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

// ─── Locale integrity of the corpus ─────────────────────────────────────────
//
// The retriever is bag-of-words over entry text, so English source material in a
// Spanish corpus is not merely useless — it scores ~0 for Spanish tokens while
// still reaching the prompt, inviting an answer the reader cannot verify.

test("Spanish corpus contains no English-only help guides", () => {
  // The rule is per-role, not blanket: a guide reaches the Spanish corpus if
  // and only if it was authored in Spanish. Asserting a fixed count here would
  // pass while carrying the wrong roles, so this checks the actual condition —
  // every ES guide slug names a role that HAS Spanish content.
  const es = buildGuestCorpus("es");
  const leaked = es
    .filter((e) => e.slug.startsWith("help:"))
    .map((e) => e.slug.slice("help:".length))
    .filter((role) => !ROLE_LABELS[role as keyof typeof ROLE_LABELS]?.es);
  assert.deepEqual(leaked, [], `ES corpus leaked English-only help guides: ${leaked.join(", ")}`);
});

test("the Spanish-authored business guides DO reach a Spanish visitor", () => {
  // The failure this guards is silent: a blanket locale skip would drop the
  // only guides written for restaurants, salons and shops — the businesses
  // actually signing up — from every Spanish conversation, and the corpus
  // would still look healthy because the other sources are bilingual.
  const es = buildGuestCorpus("es");
  const slugs = es.map((e) => e.slug);
  for (const role of ["restaurants", "salons", "shops"]) {
    assert.ok(slugs.includes(`help:${role}`), `ES corpus is missing help:${role}`);
  }
  const restaurant = es.find((e) => e.slug === "help:restaurants");
  assert.ok(restaurant, "help:restaurants missing");
  assert.match(restaurant.purpose, /restaurantes/i, "help:restaurants reached ES in English");
});

test("every business guide is authored in both languages", () => {
  // A half-translated guide is the worst outcome: it passes the leak test by
  // having an `es` field and then serves English bodies to a Spanish reader.
  for (const role of ["restaurants", "salons", "shops"] as const) {
    const content = ROLE_LABELS[role];
    assert.ok(content.es, `${role} has no Spanish content`);
    assert.equal(
      content.es.guides.length,
      content.guides.length,
      `${role} has ${content.guides.length} English guides but ${content.es.guides.length} Spanish`,
    );
    for (const guide of content.es.guides) {
      assert.ok(guide.body.length > 40, `${role} has an empty Spanish body: ${guide.heading}`);
    }
  }
});

test("English corpus still carries the help guides", () => {
  const en = buildGuestCorpus("en");
  assert.ok(
    en.some((e) => e.slug.startsWith("help:")),
    "EN corpus lost its help guides",
  );
});

test("Spanish corpus is still usefully populated without them", () => {
  const es = buildGuestCorpus("es");
  assert.ok(es.length > 10, `ES corpus too thin: ${es.length} entries`);
});
