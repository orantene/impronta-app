/**
 * posts-shared.test.ts — the Posts manager's pure rules (W3).
 *
 * Two rule sets live in `posts-shared.ts` and both are consumed twice (client
 * preview + server validation, list UI + server guard), so they are proven
 * here once, without React or Supabase:
 *
 *   1. slug derivation — what the editor previews IS what the server accepts;
 *   2. the action matrix — which state changes each status offers, including
 *      the novice guard that a live post is never one click from deletion.
 *
 * LANE — `npm run test:builder-capabilities:a` (registered explicitly in
 * package.json; a test in no lane never runs).
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  derivePostActions,
  isPostLocale,
  isValidPostSlug,
  slugifyPostTitle,
  toWebsitePostStatus,
} from "./posts-shared";

// ── slug derivation ─────────────────────────────────────────────────────────

test("slugifyPostTitle lowercases, hyphenates, folds accents, trims edge hyphens", () => {
  assert.equal(slugifyPostTitle("Spring 2026 — what's moving"), "spring-2026-what-s-moving");
  assert.equal(slugifyPostTitle("Bienvenido Tomás Navarro"), "bienvenido-tomas-navarro");
  assert.equal(slugifyPostTitle("  --Hello!!  World--  "), "hello-world");
  assert.equal(slugifyPostTitle(""), "");
});

test("every non-empty slugifyPostTitle output passes isValidPostSlug", () => {
  const titles = [
    "Spring 2026 — what's moving",
    "BTS · Vogue Italia editorial",
    "Ñandú & Ünïcodé",
    "a",
    "x".repeat(500),
  ];
  for (const title of titles) {
    const slug = slugifyPostTitle(title);
    if (slug) {
      assert.ok(isValidPostSlug(slug), `derived slug "${slug}" must validate`);
    }
  }
});

test("isValidPostSlug rejects the shapes the DB or the router would choke on", () => {
  assert.ok(isValidPostSlug("spring-drop"));
  assert.ok(isValidPostSlug("a1"));
  assert.equal(isValidPostSlug(""), false);
  assert.equal(isValidPostSlug("-leading"), false);
  assert.equal(isValidPostSlug("trailing-"), false);
  assert.equal(isValidPostSlug("double--hyphen"), false);
  assert.equal(isValidPostSlug("UPPER"), false);
  assert.equal(isValidPostSlug("with/slash"), false);
  assert.equal(isValidPostSlug("with space"), false);
  assert.equal(isValidPostSlug("x".repeat(241)), false);
});

// ── locale + status coercion ────────────────────────────────────────────────

test("isPostLocale accepts exactly the cms_posts CHECK set", () => {
  assert.ok(isPostLocale("en"));
  assert.ok(isPostLocale("es"));
  assert.equal(isPostLocale("fr"), false);
  assert.equal(isPostLocale(""), false);
});

test("toWebsitePostStatus collapses unknown values to draft, never to published", () => {
  assert.equal(toWebsitePostStatus("published"), "published");
  assert.equal(toWebsitePostStatus("archived"), "archived");
  assert.equal(toWebsitePostStatus("draft"), "draft");
  assert.equal(toWebsitePostStatus("scheduled"), "draft");
  assert.equal(toWebsitePostStatus(""), "draft");
});

// ── action matrix ───────────────────────────────────────────────────────────

test("no actions without canEdit, and none on the platform hub", () => {
  for (const status of ["draft", "published", "archived"] as const) {
    assert.deepEqual(derivePostActions(status, { canEdit: false, isPlatformHub: false }), []);
    assert.deepEqual(derivePostActions(status, { canEdit: true, isPlatformHub: true }), []);
  }
});

test("a draft offers publish + delete; a live post offers ONLY unpublish", () => {
  const ctx = { canEdit: true, isPlatformHub: false };
  assert.deepEqual(derivePostActions("draft", ctx), ["publish", "delete"]);
  // The novice guard: published → no delete. Unpublish first, then delete.
  assert.deepEqual(derivePostActions("published", ctx), ["unpublish"]);
  assert.deepEqual(derivePostActions("archived", ctx), ["publish", "delete"]);
});
