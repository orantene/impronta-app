/**
 * UNTESTED against a live database: static pin of the migration text.
 *
 * offering_variants_public_read had no is_hidden predicate, so hidden / comp
 * ticket tiers (a comp is a hidden tier at zero) were readable by anon. The
 * replacement policy must (1) require NOT is_hidden, (2) let tenant staff still
 * read hidden tiers, and (3) keep the original published/visibility/moderation
 * gates so legitimate public tiers still read.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const FILE = join(
  HERE, "..", "..", "..", "..", "supabase", "migrations", "_pending_pm",
  "20261231414500_offering_variants_public_read_hide_hidden_tiers.sql",
);
const sql = readFileSync(FILE, "utf8").replace(/--[^\n]*/g, "");

test("policy is dropped and recreated idempotently", () => {
  assert.match(sql, /DROP POLICY IF EXISTS offering_variants_public_read ON public\.talent_offering_variants/);
  assert.match(sql, /CREATE POLICY offering_variants_public_read ON public\.talent_offering_variants\s+FOR SELECT/);
});

test("anon cannot read hidden or comp tiers: NOT is_hidden is required unless staff", () => {
  assert.match(sql, /NOT talent_offering_variants\.is_hidden\s+OR public\.is_staff_of_tenant\(o\.tenant_id\)/);
});

test("legitimate public tiers still read: original offering gates are kept", () => {
  assert.match(sql, /o\.status = 'published'/);
  assert.match(sql, /o\.visibility IN \('public','on_request'\)/);
  assert.match(sql, /o\.moderation_state = 'approved'/);
});

test("the owner policy is not touched", () => {
  assert.doesNotMatch(sql, /offering_variants_owner_read/);
});
