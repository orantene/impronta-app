import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { HISTORY_KINDS } from "./types";

const MIGRATION = readFileSync(
  join(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../../../supabase/migrations/20261231299550_talent_site_history.sql",
  ),
  "utf8",
);

test("talent_site_history carries the plan's columns", () => {
  assert.match(MIGRATION, /create table if not exists public\.talent_site_history/i);
  for (const col of [
    "id uuid primary key default gen_random_uuid\\(\\)",
    "site_id uuid not null references public\\.talent_sites \\(id\\) on delete cascade",
    "talent_profile_id uuid not null references public\\.talent_profiles \\(id\\) on delete cascade",
    "at timestamptz not null default now\\(\\)",
    "summary_en text not null",
    "summary_es text not null",
    "snapshot_ref jsonb",
    "report jsonb",
    "undoable boolean not null default false",
  ]) {
    assert.match(MIGRATION, new RegExp(col, "i"), `column ${col} missing`);
  }
  assert.match(MIGRATION, /check \(actor in \('talent', 'tulala', 'system'\)\)/i);
});

test("kind CHECK matches the TypeScript kinds exactly", () => {
  const m = MIGRATION.match(/check \(kind in \(([^)]*)\)\)/i);
  assert.ok(m, "kind check present");
  const sqlKinds = m![1]!.split(",").map((s) => s.trim().replace(/'/g, ""));
  assert.deepEqual(sqlKinds, [...HISTORY_KINDS]);
});

test("RLS: service-role writes; a talent reads only her own rows; anon nothing", () => {
  assert.match(MIGRATION, /alter table public\.talent_site_history enable row level security/i);
  assert.match(MIGRATION, /revoke all on public\.talent_site_history from anon/i);
  assert.match(MIGRATION, /revoke all on public\.talent_site_history from authenticated/i);
  assert.match(MIGRATION, /grant select on public\.talent_site_history to authenticated/i);
  assert.match(
    MIGRATION,
    /create policy talent_site_history_owner_select on public\.talent_site_history\s+for select to authenticated\s+using \(public\.is_talent_profile_owner\(talent_profile_id\)\)/i,
  );
  const policies = MIGRATION.match(/create policy[\s\S]*?;/gi) ?? [];
  assert.equal(policies.length, 1, "exactly one (read) policy");
  assert.doesNotMatch(MIGRATION, /grant (insert|update|delete)[^;]*talent_site_history/i);
});

test("the atomic draft writer CASes draft_rev and writes nothing on a mismatch", () => {
  assert.match(MIGRATION, /create or replace function public\.talent_site_write_draft\(/i);
  assert.match(MIGRATION, /set draft_rev = s\.draft_rev \+ 1/i);
  assert.match(MIGRATION, /\(p_expected_rev is null or s\.draft_rev = p_expected_rev\)/i);
  assert.match(MIGRATION, /'code', 'conflict', 'current_rev'/i);
  // A missing page raises, rolling back the site write in the same transaction.
  assert.match(MIGRATION, /raise exception 'talent_site_write_draft: page not found/i);
  // History entry in the same transaction.
  assert.match(MIGRATION, /v_hist := public\.talent_site_history_append\(p_site_id, p_history\)/i);
});

test("the writer never touches live columns (draft only)", () => {
  const fn = MIGRATION.slice(MIGRATION.search(/create or replace function public\.talent_site_write_draft/i));
  const body = fn.slice(0, fn.search(/\$\$;/));
  for (const live of ["shell_published", "blocks_published", "site_published_at", "design_tokens =", "pending_design"]) {
    assert.equal(body.includes(live), false, `writer must not set ${live}`);
  }
});

test("functions are service-role only", () => {
  for (const fn of [
    "talent_site_history_snapshot\\(uuid, text\\)",
    "talent_site_history_append\\(uuid, jsonb\\)",
    "talent_site_write_draft\\(uuid, integer, jsonb, jsonb, jsonb\\)",
  ]) {
    assert.match(MIGRATION, new RegExp(`revoke all on function public\\.${fn} from public, anon, authenticated`, "i"));
    assert.match(MIGRATION, new RegExp(`grant execute on function public\\.${fn} to service_role`, "i"));
  }
});

test("edits batch inside a window and backfill is idempotent (source_ref unique per site)", () => {
  assert.match(MIGRATION, /h\.last_at > v_at - make_interval\(secs => v_batch\)/i);
  assert.match(MIGRATION, /create unique index if not exists talent_site_history_source_ref_key\s+on public\.talent_site_history \(site_id, source_ref\)\s+where source_ref is not null/i);
  assert.match(MIGRATION, /on conflict \(site_id, source_ref\) where source_ref is not null do nothing/i);
});
