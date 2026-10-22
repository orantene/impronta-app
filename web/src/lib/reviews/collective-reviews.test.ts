/**
 * TUL-1374: in a Friends collective the reviews are collected on the OWNER's
 * page, not on the member's own public page; the member keeps seeing them
 * privately in her own reviews view. Public talent loaders therefore hide a
 * talent's reviews that were earned inside a collective workspace.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import {
  collectiveTenantIdsForTalent,
  collectiveTenantIdsOwnedByTalent,
  hubReviewRoutingEnabled,
  loadWorkspaceReviews,
  mergeOwnerPageReviews,
  notInTenantsFilter,
  workspaceReviewedModels,
  workspaceReviewWithLabel,
} from "./collective-reviews";

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

// ── TUL-1591 (b): reviews follow the workspace model ────────────────────────
// Coordinator agency and friends collective: the public review sits on the workspace
// entry, the talent keeps it privately. Team studio: on the entry with a "with <talent>"
// label. Open network and rental studio: on the talent (unchanged). Behind
// HUB_REVIEW_ROUTING_ENABLED (default OFF): off keeps today's collective-only rule.

describe("TUL-1591 (b): which models take a talent's reviews off her own public page", () => {
  test("flag OFF (default): only Friends collectives, exactly as before", () => {
    assert.equal(hubReviewRoutingEnabled({}), false);
    assert.equal(hubReviewRoutingEnabled({ HUB_REVIEW_ROUTING_ENABLED: "true" }), false);
    assert.deepEqual(workspaceReviewedModels({}), ["friends_collective"]);
  });
  test("flag ON: every model where the workspace is reviewed (coordinator agency, friends collective, team studio); never open network or rental studio", () => {
    const env = { HUB_REVIEW_ROUTING_ENABLED: "1" };
    assert.equal(hubReviewRoutingEnabled(env), true);
    assert.deepEqual([...workspaceReviewedModels(env)].sort(), ["coordinator_agency", "friends_collective", "team_studio"]);
    for (const m of ["open_network", "rental_studio"]) assert.ok(!workspaceReviewedModels(env).includes(m), m);
  });
  test("the tenant lookup asks for exactly those models", async () => {
    const off = fakeDb({ agency_talent_roster: { data: [{ tenant_id: "t1" }] }, agencies: { data: [{ id: "t1" }] } });
    await collectiveTenantIdsForTalent(off as never, "tal", {});
    assert.deepEqual(off.seen.find((s) => s.table === "agencies" && s.op === "in" && s.args[0] === "work_model")?.args, ["work_model", ["friends_collective"]]);
    const on = fakeDb({ agency_talent_roster: { data: [{ tenant_id: "t1" }] }, agencies: { data: [{ id: "t1" }] } });
    assert.deepEqual(await collectiveTenantIdsForTalent(on as never, "tal", { HUB_REVIEW_ROUTING_ENABLED: "1" }), ["t1"]);
    const args = on.seen.find((s) => s.table === "agencies" && s.op === "in" && s.args[0] === "work_model")?.args as [string, string[]];
    assert.equal(args[0], "work_model");
    assert.deepEqual([...args[1]].sort(), ["coordinator_agency", "friends_collective", "team_studio"]);
  });
});

describe("TUL-1591 (b): the team studio entry reads \"with <talent>\"", () => {
  test("label in EN and ES; no name, no label", () => {
    assert.equal(workspaceReviewWithLabel("Ana", "en"), "with Ana");
    assert.equal(workspaceReviewWithLabel("Ana", "es-MX"), "con Ana");
    assert.equal(workspaceReviewWithLabel("  ", "en"), null);
    assert.equal(workspaceReviewWithLabel(null, "es"), null);
  });
  test("a team studio's workspace reviews carry the talent's name; other models never do", async () => {
    const reviews = { data: [{ id: "r1", talent_profile_id: "m1", rating: 5, body: "Great", created_at: "2026-10-01", anon: false, client_user_id: "c1" }] };
    const studio = fakeDb({ talent_reviews: reviews, talent_profiles: { data: [{ id: "m1", display_name: "Ana" }] } });
    const rows = await loadWorkspaceReviews(studio as never, "t2", 5, { workModel: "team_studio" });
    assert.equal(rows[0].withTalentName, "Ana");
    const agency = fakeDb({ talent_reviews: reviews, talent_profiles: { data: [{ id: "m1", display_name: "Ana" }] } });
    const plain = await loadWorkspaceReviews(agency as never, "t2", 5, { workModel: "coordinator_agency" });
    assert.equal(plain[0].withTalentName, null);
    assert.ok(!agency.seen.some((s) => s.table === "talent_profiles"), "names are not read when no label is shown");
  });
  test("an unreadable name list keeps the reviews, without a label", async () => {
    const db = fakeDb({
      talent_reviews: { data: [{ id: "r1", talent_profile_id: "m1", rating: 5, body: null, created_at: "2026-10-01", anon: false, client_user_id: "c1" }] },
      talent_profiles: { data: null, error: { message: "down" } },
    });
    const rows = await loadWorkspaceReviews(db as never, "t2", 5, { workModel: "team_studio" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].withTalentName, null);
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
