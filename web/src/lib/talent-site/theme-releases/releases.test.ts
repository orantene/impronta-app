import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildDraftReleaseRow, clampRolloutPct, isMissingTable } from "./releases.server";
import { planReleaseDrafts } from "../theme-catalog/sync-builtins.server";

const SQL = readFileSync(
  join(
    fileURLToPath(new URL(".", import.meta.url)),
    "../../../../../supabase/migrations/20261231299540_talent_theme_releases.sql",
  ),
  "utf8",
).replace(/--[^\n]*/g, "");

test("draft row never opens to talents", () => {
  const r = buildDraftReleaseRow({ designSlug: "maison", fromVersion: 1, toVersion: 2 });
  assert.equal(r.channel, "draft");
  assert.equal(r.status, "draft");
  assert.equal(r.rollout_pct, 0);
  assert.deepEqual(r.items, []);
});

test("critical flag derives from items", () => {
  const r = buildDraftReleaseRow({
    designSlug: "m",
    fromVersion: 1,
    toVersion: 2,
    items: [{ type: "critical", key: "hero" }],
  });
  assert.equal(r.critical, true);
});

test("rollout clamps", () => {
  assert.equal(clampRolloutPct(150), 100);
  assert.equal(clampRolloutPct(-3), 0);
  assert.equal(clampRolloutPct(NaN), 0);
  assert.equal(clampRolloutPct(33.4), 33);
});

test("missing-table detection", () => {
  assert.equal(isMissingTable({ code: "42P01" }), true);
  assert.equal(isMissingTable({ code: "PGRST205" }), true);
  assert.equal(isMissingTable({ code: "23505", message: "dup" }), false);
  assert.equal(isMissingTable(null), false);
});

test("planReleaseDrafts: only changed designs with a prior version, skips existing", () => {
  const drafts = planReleaseDrafts(
    [
      { kind: "design", slug: "a", version: 3, priorVersion: 2 },
      { kind: "design", slug: "new", version: 1, priorVersion: null },
      { kind: "design", slug: "same", version: 2, priorVersion: 2 },
      { kind: "look", slug: "l", version: 2, priorVersion: 1 },
      { kind: "design", slug: "b", version: 2, priorVersion: 1 },
    ],
    new Set(["b:2"]),
  );
  assert.deepEqual(drafts, [{ designSlug: "a", fromVersion: 2, toVersion: 3 }]);
});

test("migration: RLS on, no anon grant, no WITH CHECK (true), additive", () => {
  for (const t of ["talent_theme_releases", "talent_site_theme_updates"]) {
    assert.match(SQL, new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`));
    assert.match(SQL, new RegExp(`REVOKE ALL ON public\\.${t} FROM anon`));
  }
  assert.doesNotMatch(SQL, /GRANT[^;]*TO anon/i);
  assert.doesNotMatch(SQL, /WITH CHECK\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(SQL, /\bDROP\s+(TABLE|COLUMN)\b/i);
  assert.match(SQL, /UNIQUE \(design_slug, to_version\)/);
  assert.match(SQL, /UNIQUE \(talent_site_id, release_id\)/);
  assert.match(SQL, /draft_rev integer NOT NULL DEFAULT 0/);
  assert.match(SQL, /theme_token_origin jsonb/);
  assert.match(SQL, /state IN \('previewed', 'dismissed'\)/);
  assert.match(SQL, /GRANT UPDATE \(state, updated_at\)/);
});
