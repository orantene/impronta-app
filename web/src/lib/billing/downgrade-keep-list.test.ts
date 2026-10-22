/**
 * TUL-1291 · the owner keep-list: validation (size <= cap, ids on THIS tenant's roster) and that the billed path (webhook
 * at period end) and the unbilled path (now) archive exactly the same people. Typed fakes, no `any`.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveKeepList, toggleKeepSelection } from "./downgrade-keep-list";
import { applyPendingDowngradeAtTierDrop, archiveRosterOverflow, recordPendingDowngrade } from "./workspace-downgrade-archive";

const T = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const OWNER = "00000000-0000-4000-8000-0000000000aa";
const EVENT = "00000000-0000-4000-8000-0000000000ee";
const ROSTER = [1, 2, 3, 4, 5, 6, 7].map(T);

describe("resolveKeepList", () => {
  test("overflow without a selection is refused (nobody is hidden by a guess)", () => {
    const r = resolveKeepList({ rosterIds: ROSTER, cap: 5 });
    assert.equal(r.ok, false);
    assert.equal(r.ok === false && r.code, "needs_selection");
  });
  test("a valid selection within the cap is kept as chosen", () => {
    const r = resolveKeepList({ rosterIds: ROSTER, cap: 5, requestedKeepIds: [T(7), T(3)] });
    assert.deepEqual(r, { ok: true, keep: [T(7), T(3)], overflow: 2 });
  });
  test("more than the cap, nobody, and ids from another workspace are refused", () => {
    const code = (ids: string[]) => {
      const r = resolveKeepList({ rosterIds: ROSTER, cap: 2, requestedKeepIds: ids });
      return r.ok ? "ok" : r.code;
    };
    assert.equal(code([T(1), T(2), T(3)]), "too_many");
    assert.equal(code([]), "none_selected");
    assert.equal(code([T(1), T(99)]), "not_in_roster");
  });
  test("duplicates collapse before the cap check", () => {
    const r = resolveKeepList({ rosterIds: ROSTER, cap: 2, requestedKeepIds: [T(1), T(1), T(2)] });
    assert.deepEqual(r, { ok: true, keep: [T(1), T(2)], overflow: 5 });
  });
  test("a roster that fits keeps everyone whatever was sent; unlimited cap keeps everyone", () => {
    assert.deepEqual(resolveKeepList({ rosterIds: [T(1), T(2)], cap: 5, requestedKeepIds: [] }), { ok: true, keep: [T(1), T(2)], overflow: 0 });
    assert.deepEqual(resolveKeepList({ rosterIds: ROSTER, cap: null, requestedKeepIds: [T(1)] }), { ok: true, keep: ROSTER, overflow: 0 });
  });
  test("toggleKeepSelection stops at the cap and always allows deselecting", () => {
    assert.deepEqual(toggleKeepSelection([T(1), T(2)], T(3), 2), [T(1), T(2)]);
    assert.deepEqual(toggleKeepSelection([T(1), T(2)], T(2), 2), [T(1)]);
    assert.deepEqual(toggleKeepSelection([T(1)], T(3), 2), [T(1), T(3)]);
  });
});

// ─── a lean typed fake admin (roster + pending row) ───────────────────────────

type Row = Record<string, unknown>;
type Result = { data: Row | null; error: null; count: number | null };

class Query implements PromiseLike<Result> {
  private patch: Row | null = null;
  private wantCount = false;
  private eqs: Array<[string, unknown]> = [];
  private ins: Array<[string, unknown[]]> = [];
  private notIns: string[] = [];
  constructor(private readonly db: Fake, private readonly table: string) {}
  select(): this { return this; }
  update(patch: Row, opts?: { count?: string }): this { this.patch = patch; this.wantCount = opts?.count === "exact"; return this; }
  eq(c: string, v: unknown): this { this.eqs.push([c, v]); return this; }
  in(c: string, v: unknown[]): this { this.ins.push([c, v]); return this; }
  not(_c: string, _op: string, raw: string): this {
    this.notIns = raw.slice(1, -1).split(",").map((s) => s.replace(/"/g, "")).filter(Boolean);
    return this;
  }
  private run(): Result {
    const hit = (this.db.tables[this.table] ?? []).filter(
      (r) =>
        this.eqs.every(([c, v]) => r[c] === v) &&
        this.ins.every(([c, v]) => v.includes(r[c])) &&
        !this.notIns.includes(String(r.talent_profile_id)),
    );
    if (this.patch) {
      for (const r of hit) Object.assign(r, this.patch);
      return { data: null, error: null, count: this.wantCount ? hit.length : null };
    }
    return { data: hit[0] ?? null, error: null, count: null };
  }
  maybeSingle(): Promise<Result> { return Promise.resolve(this.run()); }
  then<A = Result, B = never>(ok?: ((v: Result) => A | PromiseLike<A>) | null, bad?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(ok, bad);
  }
}
class Fake {
  tables: Record<string, Row[]> = {
    workspace_subscriptions: [{ tenant_id: "t1", pending_downgrade: null }],
    agency_talent_roster: ROSTER.map((id) => ({ tenant_id: "t1", talent_profile_id: id, status: "active" })),
  };
  from(table: string): Query { return new Query(this, table); }
  client(): SupabaseClient { return this as unknown as SupabaseClient; }
  archivedIds(): string[] {
    return this.tables.agency_talent_roster.filter((r) => r.status === "archived_for_downgrade").map((r) => String(r.talent_profile_id)).sort();
  }
}

describe("both apply paths archive exactly the people the owner did not keep", () => {
  const picked = resolveKeepList({ rosterIds: ROSTER, cap: 5, requestedKeepIds: [T(7), T(6), T(5), T(4), T(3)] });
  assert.ok(picked.ok);
  const keep = picked.ok ? picked.keep : [];
  const expected = [T(1), T(2)];

  test("unbilled path: archived immediately", async () => {
    const db = new Fake();
    const r = await archiveRosterOverflow(db.client(), { tenantId: "t1", keepIds: keep, eventId: EVENT, actorId: OWNER, nowIso: "2026-10-21T00:00:00.000Z" });
    assert.deepEqual(r, { ok: true, count: 2 });
    assert.deepEqual(db.archivedIds(), expected);
  });

  test("billed path: nothing archived until the webhook drops the tier, then the same people", async () => {
    const db = new Fake();
    const rec = await recordPendingDowngrade(db.client(), "t1", {
      target_tier: "free", keep_ids: keep, archive_event_id: EVENT, requested_by: OWNER, requested_at: "2026-10-21T00:00:00.000Z",
    });
    assert.deepEqual(rec, { ok: true });
    assert.deepEqual(db.archivedIds(), [], "confirm time archives nobody");
    const early = await applyPendingDowngradeAtTierDrop(db.client(), { tenantId: "t1", newTier: "studio", nowIso: "x" });
    assert.equal(early.ok && early.kind, "not_yet");
    assert.deepEqual(db.archivedIds(), []);
    const drop = await applyPendingDowngradeAtTierDrop(db.client(), { tenantId: "t1", newTier: "free", nowIso: "2026-11-01T00:00:00.000Z" });
    assert.equal(drop.ok && drop.kind, "archived");
    assert.deepEqual(db.archivedIds(), expected);
  });
});

test("commitPlanDowngrade resolves the keep-list from the tenant's own roster; the modal sends overflow to the picker", () => {
  const act = readFileSync(join(process.cwd(), "src/lib/server-actions/admin-plan-downgrade.ts"), "utf8");
  assert.match(act, /resolveKeepList\(\{\s*rosterIds:/);
  assert.match(act, /\.eq\("tenant_id", tenantId\)\s*\.in\("status", \["active", "pending"\]\)/);
  assert.match(act, /keep_ids: keepIds,/);
  assert.doesNotMatch(act, /keep_ids: v\.talent_keep_ids/);
  const modal = readFileSync(join(process.cwd(), "src/components/admin/site-control-center/global-upgrade-modal.tsx"), "utf8");
  assert.match(modal, /result\.needsKeepList/);
  assert.match(modal, /commitPlanDowngrade\(\{ target_tier: "free"/);
});
