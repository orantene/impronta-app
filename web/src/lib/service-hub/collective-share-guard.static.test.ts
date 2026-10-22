/**
 * TUL-1374: the share columns can only be written by the platform, and an accept is bound to the proposal.
 * Static, because the guard is SQL and the binding is a compare-and-swap in the action.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = process.cwd();
const sql = readFileSync(join(root, "../supabase/migrations/_pending_pm/20261231420200_agencies_work_model_tul1374.sql"), "utf8");
const actions = readFileSync(join(root, "src/lib/service-hub/friends-collective-actions.ts"), "utf8");

test("a column-guard trigger covers every owner_share_*, pending_share_* and version column on the roster", () => {
  assert.match(sql, /CREATE TRIGGER agency_talent_roster_protect_owner_share\s+BEFORE INSERT OR UPDATE ON public\.agency_talent_roster/);
  const fn = sql.slice(sql.indexOf("FUNCTION public.agency_talent_roster_protect_owner_share()"), sql.indexOf("DROP TRIGGER IF EXISTS agency_talent_roster_protect_owner_share"));
  assert.match(fn, /current_user IN \('authenticated', 'anon'\)/);
  for (const col of [
    "owner_share_kind", "owner_share_bps", "owner_share_cents", "owner_share_currency", "owner_share_version",
    "owner_share_accepted_at", "owner_share_accepted_by", "pending_share_kind", "pending_share_bps",
    "pending_share_cents", "pending_share_currency", "pending_share_proposed_at",
  ]) {
    assert.match(fn, new RegExp(`NEW\\.${col}\\s+IS DISTINCT FROM OLD\\.${col}`), `${col} must be guarded on UPDATE`);
  }
  assert.match(fn, /ERRCODE = '42501'/);
  assert.doesNotMatch(fn, /m\.role = 'owner'/, "no owner exemption: even the owner writes through the action");
});

test("accepting is a compare-and-swap on the proposal the member saw", () => {
  assert.match(actions, /proposedAt: string/);
  assert.match(actions, /\.eq\("pending_share_proposed_at", r\?\.pending_share_proposed_at/);
  assert.match(actions, /written\.length !== 1\) return \{ ok: false, reason: "proposal_changed" \}/);
});
