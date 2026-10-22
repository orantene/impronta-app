/**
 * TUL-1591 (e) + TUL-1693: the owner's screen to pick who stays visible when the roster is
 * over the plan cap. The pick has its OWN state, `agency_talent_roster.keep_visible`
 * (TUL-1693): it never touches `agency_visibility = 'featured'`, which themes also show as
 * a badge. Picks fill the cap first, then the longest-standing members; the rest are hidden
 * from the public list, never removed. The screen ships with #4178's flag
 * (HUB_PLAN_CAP_PICKS_ENABLED, default OFF). While the keep_visible migration is not
 * applied the screen fails closed: nobody shows as kept and saving says "not available yet".
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { VISIBLE_PICKS_COPY, nextKeepVisible, picksSummary, visiblePicksEnabled } from "./visible-picks";
import { loadVisiblePicks } from "./visible-picks.server";

const WEB = process.cwd();
const read = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

describe("the pick is its own state (keep_visible), never 'featured' (TUL-1693)", () => {
  test("keep a public member: keep_visible on; already kept: nothing to do", () => {
    assert.deepEqual(nextKeepVisible({ agencyVisibility: "site_visible", keepVisible: false }, true), { ok: true, next: true });
    assert.deepEqual(nextKeepVisible({ agencyVisibility: "featured", keepVisible: false }, true), { ok: true, next: true });
    assert.deepEqual(nextKeepVisible({ agencyVisibility: "site_visible", keepVisible: true }, true), { ok: true, next: null });
  });
  test("drop a pick: keep_visible off; not a pick: nothing to do", () => {
    assert.deepEqual(nextKeepVisible({ agencyVisibility: "featured", keepVisible: true }, false), { ok: true, next: false });
    assert.deepEqual(nextKeepVisible({ agencyVisibility: "site_visible", keepVisible: false }, false), { ok: true, next: null });
  });
  test("a member who is not public cannot be picked here (publishing has its own checklist)", () => {
    for (const v of ["roster_only", "", null, "weird"]) assert.deepEqual(nextKeepVisible({ agencyVisibility: v, keepVisible: false }, true), { ok: false, reason: "not_public" }, String(v));
    assert.deepEqual(nextKeepVisible({ agencyVisibility: "roster_only", keepVisible: false }, false), { ok: true, next: null });
    // a stale pick on a member who is no longer public can still be dropped
    assert.deepEqual(nextKeepVisible({ agencyVisibility: "roster_only", keepVisible: true }, false), { ok: true, next: false });
  });
});

describe("the summary the owner sees", () => {
  test("unlimited plan: nothing to pick", () => {
    assert.deepEqual(picksSummary({ cap: null, memberCount: 40, pickedCount: 3 }), { unlimited: true, overCap: false, hiddenCount: 0, tooManyPicks: false });
  });
  test("within the cap: nobody is hidden", () => {
    assert.deepEqual(picksSummary({ cap: 5, memberCount: 5, pickedCount: 0 }), { unlimited: false, overCap: false, hiddenCount: 0, tooManyPicks: false });
  });
  test("over the cap: how many are hidden, and whether there are more picks than seats", () => {
    assert.deepEqual(picksSummary({ cap: 5, memberCount: 8, pickedCount: 2 }), { unlimited: false, overCap: true, hiddenCount: 3, tooManyPicks: false });
    assert.deepEqual(picksSummary({ cap: 5, memberCount: 8, pickedCount: 6 }), { unlimited: false, overCap: true, hiddenCount: 3, tooManyPicks: true });
  });
  test("bad numbers never produce a negative count", () => {
    assert.equal(picksSummary({ cap: -2, memberCount: 3, pickedCount: 0 }).hiddenCount, 3);
  });
});

describe("flag and copy", () => {
  test("only HUB_PLAN_CAP_PICKS_ENABLED=1 shows the screen (same flag as #4178's directory wiring)", () => {
    assert.equal(visiblePicksEnabled({}), false);
    assert.equal(visiblePicksEnabled({ HUB_PLAN_CAP_PICKS_ENABLED: "true" }), false);
    assert.equal(visiblePicksEnabled({ HUB_PLAN_CAP_PICKS_ENABLED: "1" }), true);
  });
  test("the wording is gender neutral in ES and says 'the people you pick' in both (TUL-1693)", () => {
    const es = VISIBLE_PICKS_COPY.es.overCap(3, 5);
    const en = VISIBLE_PICKS_COPY.en.overCap(3, 5);
    assert.doesNotMatch(es, /elegidas|elegidos|Tus elegid/i);
    assert.match(es, /Las personas que elijas ocupan los 5 lugares/);
    assert.match(en, /The people you pick fill the 5 places/);
    for (const v of Object.values(VISIBLE_PICKS_COPY.es)) {
      const text = typeof v === "function" ? (v as (...a: number[]) => string)(3, 5) : v;
      assert.doesNotMatch(text, /\b(elegidas|elegidos|elegida|elegido)\b/i, text);
    }
  });
  test("there is a friendly 'not available yet' message for when the pick cannot be saved yet", () => {
    assert.match(VISIBLE_PICKS_COPY.en.notReady, /not available yet/i);
    assert.match(VISIBLE_PICKS_COPY.es.notReady, /todavía no está disponible/i);
  });
  test("ES and EN have the same keys, no empty strings and no em dash", () => {
    assert.deepEqual(Object.keys(VISIBLE_PICKS_COPY.es).sort(), Object.keys(VISIBLE_PICKS_COPY.en).sort());
    for (const loc of ["es", "en"] as const) {
      for (const [k, v] of Object.entries(VISIBLE_PICKS_COPY[loc])) {
        const text = typeof v === "function" ? (v as (...a: number[]) => string)(3, 5) : v;
        assert.ok(text.trim().length > 0, `${loc}.${k}`);
        assert.doesNotMatch(text, /\u2014/, `${loc}.${k}`);
      }
    }
  });
});

// ── loader ──────────────────────────────────────────────────────────────────

type Reply = { data?: unknown; error?: { message?: string } | null };
function fakeAdmin(replies: Record<string, Reply>) {
  const seen: Array<{ table: string; op: string; args: unknown[] }> = [];
  return {
    seen,
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "neq", "order"]) {
        q[op] = (...args: unknown[]) => {
          seen.push({ table, op, args });
          return q;
        };
      }
      q.maybeSingle = () => Promise.resolve(replies[table] ?? { data: null, error: null });
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(replies[table] ?? { data: [], error: null }).then(res);
      return q;
    },
  };
}

describe("loading the members to pick from", () => {
  const roster = {
    data: [
      { tenant_id: "t1", talent_profile_id: "a", agency_visibility: "featured", keep_visible: false, added_at: "2026-01-01", talent_profiles: { display_name: "Ana" } },
      { tenant_id: "t1", talent_profile_id: "b", agency_visibility: "site_visible", keep_visible: true, added_at: "2026-02-01", talent_profiles: [{ display_name: " Bea " }] },
      { tenant_id: "other", talent_profile_id: "x", agency_visibility: "site_visible", keep_visible: true, added_at: "2026-02-01", talent_profiles: { display_name: "X" } },
    ],
  };
  test("this workspace's ACTIVE public members, oldest first, with the cap from the plan", async () => {
    const admin = fakeAdmin({ agencies: { data: { plan_tier: "free", talent_seat_limit: null } }, agency_talent_roster: roster });
    const r = await loadVisiblePicks(admin as never, "t1");
    assert.ok(r);
    assert.equal(r.cap, 5);
    assert.equal(r.pickAvailable, true);
    // picked comes from keep_visible only: featured Ana is NOT a pick, Bea is
    assert.deepEqual(r.members.map((m) => [m.talentProfileId, m.name, m.picked]), [["a", "Ana", false], ["b", "Bea", true]]);
    assert.ok(admin.seen.some((s) => s.table === "agency_talent_roster" && s.op === "select" && String(s.args[0]).includes("keep_visible")));
    assert.ok(admin.seen.some((s) => s.table === "agency_talent_roster" && s.op === "eq" && s.args[0] === "status" && s.args[1] === "active"));
    assert.ok(admin.seen.some((s) => s.table === "agency_talent_roster" && s.op === "eq" && s.args[0] === "tenant_id" && s.args[1] === "t1"));
  });
  test("an explicit seat limit wins; an unlimited plan has no cap", async () => {
    assert.equal((await loadVisiblePicks(fakeAdmin({ agencies: { data: { plan_tier: "studio", talent_seat_limit: 15 } }, agency_talent_roster: roster }) as never, "t1"))?.cap, 15);
    assert.equal((await loadVisiblePicks(fakeAdmin({ agencies: { data: { plan_tier: "agency", talent_seat_limit: null } }, agency_talent_roster: roster }) as never, "t1"))?.cap, null);
  });
  test("keep_visible not migrated yet: fails closed (nobody kept, pick not available), members still listed", async () => {
    let calls = 0;
    const admin = fakeAdmin({ agencies: { data: { plan_tier: "free", talent_seat_limit: null } } });
    const base = admin.from.bind(admin);
    admin.from = (table: string) => {
      const q = base(table);
      if (table !== "agency_talent_roster") return q;
      calls += 1;
      const reply: Reply = calls === 1
        ? { data: null, error: { message: 'column agency_talent_roster.keep_visible does not exist' } }
        : { data: roster.data.map(({ keep_visible: _k, ...rest }) => rest) };
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(reply).then(res);
      return q;
    };
    const r = await loadVisiblePicks(admin as never, "t1");
    assert.ok(r);
    assert.equal(r.pickAvailable, false);
    assert.deepEqual(r.members.map((m) => [m.talentProfileId, m.picked]), [["a", false], ["b", false]]);
    assert.equal(calls, 2);
  });
  test("any read error is null (the screen says it could not load, never a partial list)", async () => {
    assert.equal(await loadVisiblePicks(fakeAdmin({ agencies: { data: null, error: { message: "x" } } }) as never, "t1"), null);
    assert.equal(await loadVisiblePicks(fakeAdmin({ agencies: { data: { plan_tier: "free" } }, agency_talent_roster: { data: null, error: { message: "x" } } }) as never, "t1"), null);
  });
});

describe("wiring", () => {
  const dir = "src/app/(workspace)/[tenantSlug]/admin/settings/visible-picks";
  test("the page is hidden unless the flag is on, and is tenant scoped", () => {
    const page = read(`${dir}/page.tsx`);
    assert.match(page, /if \(!visiblePicksEnabled\(\)\) notFound\(\)/);
    assert.match(page, /getTenantPortalScopeBySlug\(tenantSlug\)/);
    assert.match(page, /loadVisiblePicks\(admin, scope\.tenantId\)/);
  });
  test("the action is a write: not while impersonating, roster editors only, tenant-scoped update of an ACTIVE row", () => {
    const action = read(`${dir}/actions.ts`);
    assert.match(action, /^"use server";/);
    assert.match(action, /await requireNotImpersonating\(\)/);
    assert.match(action, /requireWorkspaceStaffAction\(\{ capability: "agency\.roster\.edit" \}\)/);
    assert.match(action, /tenantScopedQuery\(admin, "agency_talent_roster", tenantId\)\s*\.update\(/);
    assert.match(action, /\.eq\("status", "active"\)/);
    assert.match(action, /if \(!visiblePicksEnabled\(\)\)/);
  });
  test("the action writes keep_visible and never agency_visibility (TUL-1693)", () => {
    const action = read(`${dir}/actions.ts`);
    assert.match(action, /\.update\(\{ keep_visible: decision\.next \}\)/);
    assert.doesNotMatch(action, /\.update\(\{[^}]*agency_visibility/);
    assert.doesNotMatch(action, /"featured"/);
  });
  test("the action fails closed while keep_visible is not migrated: 'not_ready', nothing written", () => {
    const action = read(`${dir}/actions.ts`);
    assert.match(action, /isPostgrestMissingColumnError\(readErr\)\) return \{ ok: false, reason: "not_ready" \}/);
    const ui = read(`${dir}/VisiblePicksPanel.tsx`);
    assert.match(ui, /r\.reason === "not_ready"/);
    assert.match(ui, /c\.notReady/);
    assert.match(ui, /picks\.pickAvailable/);
  });
  test("the migration is additive: keep_visible boolean NOT NULL DEFAULT false on agency_talent_roster", () => {
    const sql = readFileSync(path.join(WEB, "..", "supabase/migrations/_pending_pm/20261231423300_roster_keep_visible.sql"), "utf8");
    assert.match(sql, /ALTER TABLE public\.agency_talent_roster\s+ADD COLUMN IF NOT EXISTS keep_visible boolean NOT NULL DEFAULT false/);
    assert.doesNotMatch(sql, /\b(DROP|UPDATE|DELETE)\b/i);
  });
  test("the screen links back with next/link and uses no hex colours", () => {
    const ui = read(`${dir}/VisiblePicksPanel.tsx`);
    assert.match(ui, /from "next\/link"/);
    assert.doesNotMatch(ui, /<a href="\//);
    assert.doesNotMatch(ui, /#[0-9a-fA-F]{3,8}\b/);
  });
});
