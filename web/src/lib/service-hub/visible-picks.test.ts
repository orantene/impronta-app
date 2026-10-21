/**
 * TUL-1591 (e): the owner's screen to pick who stays visible when the roster is over the
 * plan cap. The pick is the roster's existing "featured" setting (#4178 reads it:
 * picks fill the cap first, then the longest-standing members; the rest are hidden from
 * the public list, never removed). The screen ships with #4178's flag
 * (HUB_PLAN_CAP_PICKS_ENABLED, default OFF).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

import { VISIBLE_PICKS_COPY, nextPickVisibility, picksSummary, visiblePicksEnabled } from "./visible-picks";
import { loadVisiblePicks } from "./visible-picks.server";

const WEB = process.cwd();
const read = (rel: string) => readFileSync(path.join(WEB, rel), "utf8");

describe("the pick is the roster's featured setting", () => {
  test("keep a public member: featured; already featured: nothing to do", () => {
    assert.deepEqual(nextPickVisibility("site_visible", true), { ok: true, next: "featured" });
    assert.deepEqual(nextPickVisibility("featured", true), { ok: true, next: null });
  });
  test("drop a pick: back to plain public; not a pick: nothing to do", () => {
    assert.deepEqual(nextPickVisibility("featured", false), { ok: true, next: "site_visible" });
    assert.deepEqual(nextPickVisibility("site_visible", false), { ok: true, next: null });
  });
  test("a member who is not public cannot be picked here (publishing has its own checklist)", () => {
    for (const v of ["roster_only", "", null, "weird"]) assert.deepEqual(nextPickVisibility(v, true), { ok: false, reason: "not_public" }, String(v));
    assert.deepEqual(nextPickVisibility("roster_only", false), { ok: true, next: null });
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
      { tenant_id: "t1", talent_profile_id: "a", agency_visibility: "featured", added_at: "2026-01-01", talent_profiles: { display_name: "Ana" } },
      { tenant_id: "t1", talent_profile_id: "b", agency_visibility: "site_visible", added_at: "2026-02-01", talent_profiles: [{ display_name: " Bea " }] },
      { tenant_id: "other", talent_profile_id: "x", agency_visibility: "site_visible", added_at: "2026-02-01", talent_profiles: { display_name: "X" } },
    ],
  };
  test("this workspace's ACTIVE public members, oldest first, with the cap from the plan", async () => {
    const admin = fakeAdmin({ agencies: { data: { plan_tier: "free", talent_seat_limit: null } }, agency_talent_roster: roster });
    const r = await loadVisiblePicks(admin as never, "t1");
    assert.ok(r);
    assert.equal(r.cap, 5);
    assert.deepEqual(r.members.map((m) => [m.talentProfileId, m.name, m.picked]), [["a", "Ana", true], ["b", "Bea", false]]);
    assert.ok(admin.seen.some((s) => s.table === "agency_talent_roster" && s.op === "eq" && s.args[0] === "status" && s.args[1] === "active"));
    assert.ok(admin.seen.some((s) => s.table === "agency_talent_roster" && s.op === "eq" && s.args[0] === "tenant_id" && s.args[1] === "t1"));
  });
  test("an explicit seat limit wins; an unlimited plan has no cap", async () => {
    assert.equal((await loadVisiblePicks(fakeAdmin({ agencies: { data: { plan_tier: "studio", talent_seat_limit: 15 } }, agency_talent_roster: roster }) as never, "t1"))?.cap, 15);
    assert.equal((await loadVisiblePicks(fakeAdmin({ agencies: { data: { plan_tier: "agency", talent_seat_limit: null } }, agency_talent_roster: roster }) as never, "t1"))?.cap, null);
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
  test("the screen links back with next/link and uses no hex colours", () => {
    const ui = read(`${dir}/VisiblePicksPanel.tsx`);
    assert.match(ui, /from "next\/link"/);
    assert.doesNotMatch(ui, /<a href="\//);
    assert.doesNotMatch(ui, /#[0-9a-fA-F]{3,8}\b/);
  });
});
