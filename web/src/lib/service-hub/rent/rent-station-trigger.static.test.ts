/**
 * TUL-1600: an offering a renting member creates AFTER the station was assigned holds the station too. The choke point
 * is the database (offerings are inserted from many places), so a BEFORE INSERT trigger on talent_offerings adds the
 * station to attributes.resourceSet.spaceIds. Static: the SQL cannot run in unit tests; staging QA proves it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const sql = readFileSync(join(process.cwd(), "../supabase/migrations/_pending_pm/20261231423020_studio_rent_station_trigger_tul1600.sql"), "utf8");
const start = sql.indexOf("FUNCTION public.talent_offerings_hold_rent_station()");
const fn = sql.slice(start, sql.indexOf("DROP TRIGGER IF EXISTS talent_offerings_hold_rent_station", start));

test("a BEFORE INSERT trigger on talent_offerings holds the station", () => {
  assert.match(sql, /CREATE TRIGGER talent_offerings_hold_rent_station\s+BEFORE INSERT ON public\.talent_offerings/);
  assert.ok(fn.length > 100, "the function is defined");
});

test("only the member's own live plan in the offering's own workspace, with a station that is still a space of that workspace", () => {
  assert.match(fn, /tenant_id\s*=\s*NEW\.tenant_id/);
  assert.match(fn, /talent_profile_id\s*=\s*NEW\.talent_profile_id/);
  assert.match(fn, /status IN \('active', ?'paused'\)/);
  assert.match(fn, /station_resource_id IS NOT NULL/);
  assert.match(fn, /FROM public\.spaces[\s\S]*tenant_id = NEW\.tenant_id/);
});

test("it adds the station without removing what is there, no duplicates, and never fails the insert", () => {
  assert.match(fn, /resourceSet/);
  assert.match(fn, /spaceIds/);
  assert.match(fn, /@>/, "no duplicate");
  assert.match(fn, /RETURN NEW/);
  assert.doesNotMatch(fn, /RAISE EXCEPTION/, "a hold problem never blocks creating a service");
});

test("rollback line drops the trigger and function; the migration already on main is untouched", () => {
  assert.match(sql, /DROP TRIGGER IF EXISTS talent_offerings_hold_rent_station ON public\.talent_offerings/);
  assert.match(sql, /DROP FUNCTION IF EXISTS public\.talent_offerings_hold_rent_station\(\)/);
  assert.doesNotMatch(readFileSync(join(process.cwd(), "../supabase/migrations/_pending_pm/20261231420700_studio_rent_tul1376.sql"), "utf8"), /talent_offerings_hold_rent_station/);
});
