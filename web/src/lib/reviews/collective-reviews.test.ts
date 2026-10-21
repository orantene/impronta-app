/**
 * TUL-1374: in a Friends collective the reviews are collected on the OWNER's
 * page, not on the member's own public page; the member keeps seeing them
 * privately in her own reviews view. Public talent loaders therefore hide a
 * talent's reviews that were earned inside a collective workspace.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { collectiveTenantIdsForTalent, collectiveTenantIdsOwnedByTalent, loadWorkspaceReviews, mergeOwnerPageReviews, notInTenantsFilter } from "./collective-reviews";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

type Reply = { data?: unknown; error?: { code?: string; message?: string } | null };
function fakeDb(replies: Record<string, Reply>) {
  const seen: Array<{ table: string; op: string; args: unknown[] }> = [];
  return {
    seen,
    from(table: string) {
      const q: Record<string, unknown> = {};
      for (const op of ["select", "eq", "in", "neq", "order", "limit", "range", "not", "maybeSingle"]) {
        q[op] = (...args: unknown[]) => {
          seen.push({ table, op, args });
          return q;
        };
      }
      q.then = (res: (v: unknown) => unknown) => Promise.resolve(replies[table] ?? { data: [], error: null }).then(res);
      return q;
    },
  };
}

describe("which tenants hide a talent's reviews from her own page", () => {
  test("only the talent's rostered workspaces that are Friends collectives", async () => {
    const db = fakeDb({
      agency_talent_roster: { data: [{ tenant_id: "t1" }, { tenant_id: "t2" }, { tenant_id: "t2" }] },
      agencies: { data: [{ id: "t2" }] },
    });
    assert.deepEqual(await collectiveTenantIdsForTalent(db as never, "tal"), ["t2"]);
  });
  test("no roster rows: none, and agencies is never queried", async () => {
    const db = fakeDb({ agency_talent_roster: { data: [] } });
    assert.deepEqual(await collectiveTenantIdsForTalent(db as never, "tal"), []);
    assert.ok(!db.seen.some((s) => s.table === "agencies"));
  });
  test("any read problem (including the column not existing yet) hides nothing: public pages never break", async () => {
    for (const reply of [{ data: null, error: { code: "42703" } }, { data: null, error: { message: "down" } }]) {
      assert.deepEqual(await collectiveTenantIdsForTalent(fakeDb({ agency_talent_roster: { data: [{ tenant_id: "t" }] }, agencies: reply }) as never, "tal"), []);
      assert.deepEqual(await collectiveTenantIdsForTalent(fakeDb({ agency_talent_roster: reply }) as never, "tal"), []);
    }
    assert.deepEqual(await collectiveTenantIdsForTalent({ from: () => { throw new Error("x"); } } as never, "tal"), []);
  });
  test("the PostgREST filter value", () => {
    assert.equal(notInTenantsFilter(["a", "b"]), "(a,b)");
  });
});

describe("the owner's page collects the workspace's reviews", () => {
  test("published reviews of that workspace only, newest first", async () => {
    const db = fakeDb({
      talent_reviews: { data: [{ id: "r1", talent_profile_id: "m1", rating: 5, body: "Great", created_at: "2026-10-01", anon: false, client_user_id: "c1" }] },
    });
    const rows = await loadWorkspaceReviews(db as never, "t2", 5);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, "r1");
    assert.ok(db.seen.some((s) => s.op === "eq" && s.args[0] === "tenant_id" && s.args[1] === "t2"));
    assert.ok(db.seen.some((s) => s.op === "eq" && s.args[0] === "status" && s.args[1] === "published"));
  });
  test("an error is an empty list", async () => {
    assert.deepEqual(await loadWorkspaceReviews(fakeDb({ talent_reviews: { data: null, error: { message: "x" } } }) as never, "t", 5), []);
  });
});

describe("the member still sees her own reviews privately", () => {
  test("the owner-of-the-profile loader is not filtered by the collective rule", () => {
    const src = read("./load-reviews.ts");
    const own = src.slice(src.indexOf("export async function loadTalentReviewsForOwner"));
    const end = own.indexOf("\nexport ", 10);
    assert.doesNotMatch(end > 0 ? own.slice(0, end) : own, /hiddenCollectiveTenants|notInTenantsFilter/);
  });
});

describe("wiring", () => {
  const src = read("./load-reviews.ts");
  test("the public talent list, the breakdown and the summary all hide collective reviews, and the cached average is bypassed for those talents", () => {
    assert.match(src, /collectiveTenantIdsForTalent\(/);
    assert.match(src, /notInTenantsFilter\(hidden\)/);
    assert.match(src, /const cachedCount = hidden\.length > 0 \? undefined :/);
  });
});

describe("TUL-1467: the owner's PUBLIC page shows the collective's reviews", () => {
  test("a talent owns the collectives where her account is an active owner", async () => {
    const db = fakeDb({
      talent_profiles: { data: { user_id: "u1" } },
      agency_memberships: { data: [{ tenant_id: "t1" }, { tenant_id: "t2" }] },
      agencies: { data: [{ id: "t2" }] },
    });
    assert.deepEqual(await collectiveTenantIdsOwnedByTalent(db as never, "tal"), ["t2"]);
    assert.ok(db.seen.some((s) => s.table === "agency_memberships" && s.op === "eq" && s.args[0] === "role" && s.args[1] === "owner"));
    assert.ok(db.seen.some((s) => s.table === "agency_memberships" && s.op === "eq" && s.args[0] === "status" && s.args[1] === "active"));
  });
  test("no account, no memberships or any read problem: she owns none, her page is unchanged", async () => {
    assert.deepEqual(await collectiveTenantIdsOwnedByTalent(fakeDb({ talent_profiles: { data: { user_id: null } } }) as never, "tal"), []);
    assert.deepEqual(await collectiveTenantIdsOwnedByTalent(fakeDb({ talent_profiles: { data: { user_id: "u" } }, agency_memberships: { data: null, error: { message: "x" } } }) as never, "tal"), []);
    assert.deepEqual(await collectiveTenantIdsOwnedByTalent({ from: () => { throw new Error("x"); } } as never, "tal"), []);
  });
  const r = (id: string, createdAt: string, body: string | null = "Great") => ({ id, body, rating: 5, createdAt, clientName: null });
  test("her own reviews and the collective's merge newest first, no duplicates, empty bodies dropped, capped", () => {
    const merged = mergeOwnerPageReviews(
      [r("a", "2026-10-01"), r("dup", "2026-10-03")],
      [r("dup", "2026-10-03"), r("b", "2026-10-05"), r("empty", "2026-10-09", "  ")],
      3,
    );
    assert.deepEqual(merged.map((x) => x.id), ["b", "dup", "a"]);
    assert.equal(mergeOwnerPageReviews([r("a", "2026-10-01"), r("b", "2026-10-02")], [], 1).length, 1);
  });
  test("the collective's reviews never carry a client name (the page shows the quote and the rating only)", () => {
    const merged = mergeOwnerPageReviews([], [{ ...r("w", "2026-10-02"), clientName: "Luis" }], 5);
    assert.equal(merged[0].clientName, null);
  });
  test("wiring: the reviews source adds the collective's reviews only for a collective owner", () => {
    const src = read("../site-admin/builder-node/reviews-sources.ts");
    assert.match(src, /collectiveTenantIdsOwnedByTalent\(/);
    assert.match(src, /mergeOwnerPageReviews\(/);
  });
});
