import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

// F1 (TUL-1273 deferred): HELD migration adds a published-offerings leg to the directory
// search. Pins: same signature, every existing leg kept, only guest-sellable (D-10)
// talent offerings, no SECURITY DEFINER, no facet function touched.
const FILE = "supabase/migrations/_pending_pm/20261231415600_directory_search_offerings.sql";
const sql = readFileSync(join(process.cwd(), "..", FILE), "utf8");
const code = sql
  .split("\n")
  .filter((l) => !l.trim().startsWith("--"))
  .join("\n");

test("F1: keeps the directory_search_public_talent_ids(text) signature", () => {
  assert.equal((code.match(/CREATE OR REPLACE FUNCTION/g) ?? []).length, 1);
  assert.match(code, /CREATE OR REPLACE FUNCTION public\.directory_search_public_talent_ids\(p_query text\)\s+RETURNS SETOF uuid\s+LANGUAGE plpgsql\s+STABLE\s+SET search_path TO 'public'/);
  assert.doesNotMatch(code, /SECURITY DEFINER/i);
  assert.doesNotMatch(code, /DROP FUNCTION/i);
  assert.doesNotMatch(code, /directory_facet_/);
});

test("F1: every existing leg is still there (name/bio FTS, location, taxonomy, System B values)", () => {
  for (const needle of [
    "coalesce(tp.bio_i18n ->> 'en', '')",
    "similarity(coalesce(tp.display_name, ''), v_safe) > 0.22",
    "coalesce(l.display_name_i18n ->> 'es', '') ILIKE v_like",
    "similarity(coalesce(tt.name_i18n ->> 'en', ''), v_safe) > 0.2",
    "FROM public.talent_profile_field_values bv",
    "'creator.instagram_handle', 'creator.tiktok_handle', 'creator.youtube_channel'",
  ]) {
    assert.ok(code.includes(needle), `missing existing leg text: ${needle}`);
  }
  assert.equal((code.match(/\bUNION\b/g) ?? []).length, 4, "3 existing UNIONs + 1 offerings UNION");
});

test("F1: adds the offerings leg over title, category and description", () => {
  assert.match(code, /FROM public\.talent_offerings o/);
  for (const col of ["o.title", "o.category", "o.description"]) {
    assert.ok(code.includes(`coalesce(${col}, '')`), `offerings leg must search ${col}`);
  }
});

test("F1 D-10: the offerings leg is fail-safe (published + approved + public talent rows only)", () => {
  const leg = code.slice(code.indexOf("FROM public.talent_offerings o"));
  assert.match(leg, /o\.status = 'published'/);
  assert.match(leg, /o\.moderation_state = 'approved'/);
  assert.match(leg, /o\.visibility = 'public'/);
  assert.match(leg, /o\.owner_kind = 'talent'/);
  assert.match(leg, /tp\.deleted_at IS NULL/);
  assert.match(leg, /tp\.is_publicly_hidden = false/);
  assert.doesNotMatch(leg, /on_request|agency_only/);
});
