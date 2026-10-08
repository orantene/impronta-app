import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { loadTalentSurfaceNotifications } from "@/app/(workspace)/[tenantSlug]/_data-bridge/notifications";
import { loadClientSelfProfile } from "@/app/(workspace)/[tenantSlug]/_data-bridge/clients";
import { loadClientTrustBillingState } from "@/app/(workspace)/[tenantSlug]/_data-bridge";
import { loadMyNotifications } from "@/lib/notifications/self";
import { loadTalentActor } from "@/lib/messaging/talent-actor";
import { loadTalentVisibleInquiryIds } from "@/lib/messaging/talent-inbox-rows";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { loadTalentPersonalSiteDashboardState } from "@/lib/talent-site/server/dashboard-state";
import {
  loadFavoriteTalentIdsForContext,
  loadSavedTalentIdsForContext,
} from "@/lib/public-discovery-effective";
import {
  effectiveReadContext,
  pickReadClient,
  readUserId,
  type EffectiveReadContext,
} from "./effective-read";

const A = "aaaaaaaa-staff-actor";
const B = "bbbbbbbb-impersonated-subject";
const TENANT = "tenant-1";

// ── fakes ───────────────────────────────────────────────────────────────────

type Call = { client: string; table: string; eq: Array<[string, unknown]> };

/** Chainable, thenable PostgREST fake that records every table and `.eq` it is asked for. */
function fakeClient(
  name: string,
  calls: Call[],
  opts: { userId?: string; data?: (table: string) => unknown } = {},
): SupabaseClient {
  const dataFor = opts.data ?? (() => []);
  const from = (table: string) => {
    const call: Call = { client: name, table, eq: [] };
    calls.push(call);
    const result = () => ({ data: dataFor(table), error: null });
    const q: Record<string, unknown> = {};
    for (const m of ["select", "order", "limit", "in", "is", "gte", "neq", "returns"]) {
      q[m] = () => q;
    }
    q.eq = (col: string, val: unknown) => {
      call.eq.push([col, val]);
      return q;
    };
    q.maybeSingle = async () => {
      const d = dataFor(table);
      return { data: Array.isArray(d) ? (d[0] ?? null) : d, error: null };
    };
    q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve);
    return q;
  };
  return {
    from,
    auth: {
      getUser: async () => ({ data: { user: opts.userId ? { id: opts.userId } : null }, error: null }),
    },
  } as unknown as SupabaseClient;
}

const idsOf = (calls: Call[], client: string, table: string): unknown[] =>
  calls.filter((c) => c.client === client && c.table === table).flatMap((c) => c.eq.map(([, v]) => v));

const impersonating: EffectiveReadContext = { actorUserId: A, userId: B, impersonated: true };
// A forged/inconsistent context: claims impersonation but was built for another actor.
const forgedForOtherActor: EffectiveReadContext = { actorUserId: "someone-else", userId: B, impersonated: true };
// Claims a different subject without the verified flag.
const unverifiedClaim: EffectiveReadContext = { actorUserId: A, userId: B, impersonated: false };

// ── effectiveReadContext: the only door ─────────────────────────────────────

test("effectiveReadContext: no identity or not impersonating reads as the actor", () => {
  assert.deepEqual(effectiveReadContext(A, null), { actorUserId: A, userId: A, impersonated: false });
  assert.deepEqual(
    effectiveReadContext(A, { actorUser: { id: A }, effectiveUserId: A, isImpersonating: false }),
    { actorUserId: A, userId: A, impersonated: false },
  );
});

test("effectiveReadContext: a verified identity yields the target", () => {
  assert.deepEqual(
    effectiveReadContext(A, { actorUser: { id: A }, effectiveUserId: B, isImpersonating: true }),
    impersonating,
  );
});

test("effectiveReadContext: forged identities fall back to the actor", () => {
  const own = { actorUserId: A, userId: A, impersonated: false };
  // Identity built for a different actor than the session user.
  assert.deepEqual(
    effectiveReadContext(A, { actorUser: { id: "x" }, effectiveUserId: B, isImpersonating: true }),
    own,
  );
  // Impersonating "yourself", or an empty target.
  assert.deepEqual(effectiveReadContext(A, { actorUser: { id: A }, effectiveUserId: A, isImpersonating: true }), own);
  assert.deepEqual(effectiveReadContext(A, { actorUser: { id: A }, effectiveUserId: "", isImpersonating: true }), own);
});

test("pickReadClient: admin only for a verified impersonation of that exact target", () => {
  const rls = { tag: "rls" } as unknown as SupabaseClient;
  const admin = { tag: "admin" } as unknown as SupabaseClient;
  const pick = (userId: string, ctx?: EffectiveReadContext) =>
    pickReadClient({ sessionUserId: A, userId, ctx, rlsClient: rls, adminClient: () => admin });
  assert.equal(pick(B, impersonating), admin);
  assert.equal(pick(A), rls);
  assert.equal(pick(A, effectiveReadContext(A, null)), rls);
  assert.equal(pick(B, unverifiedClaim), rls);
  assert.equal(pick(B, forgedForOtherActor), rls);
  assert.equal(pick("someone-third", impersonating), rls, "context for B must not unlock any other id");
  assert.equal(
    pickReadClient({ sessionUserId: A, userId: B, ctx: impersonating, rlsClient: rls, adminClient: () => null }),
    null,
    "no admin client: fail closed, never fall back to the actor client",
  );
});

// ── loadMyNotifications (client bell) ───────────────────────────────────────

function notifDeps(calls: Call[]) {
  return {
    rlsClient: async () => fakeClient("rls", calls, { userId: A }),
    adminClient: () => fakeClient("admin", calls),
  };
}

test("loadMyNotifications: staff A impersonating B queries B's rows with the service client, never A", async () => {
  const calls: Call[] = [];
  await loadMyNotifications(50, impersonating, notifDeps(calls));
  assert.deepEqual(idsOf(calls, "admin", "user_notifications"), [B]);
  assert.deepEqual(idsOf(calls, "rls", "user_notifications"), []);
  assert.ok(!calls.some((c) => c.eq.some(([, v]) => v === A)));
});

test("loadMyNotifications: no impersonation reads the real user through the RLS client", async () => {
  const calls: Call[] = [];
  await loadMyNotifications(50, undefined, notifDeps(calls));
  assert.deepEqual(idsOf(calls, "rls", "user_notifications"), [A]);
  assert.equal(calls.filter((c) => c.client === "admin").length, 0);
});

test("loadMyNotifications: a forged context falls back to the actor", async () => {
  for (const ctx of [forgedForOtherActor, unverifiedClaim]) {
    const calls: Call[] = [];
    await loadMyNotifications(50, ctx, notifDeps(calls));
    assert.deepEqual(idsOf(calls, "rls", "user_notifications"), [A]);
    assert.equal(calls.filter((c) => c.client === "admin").length, 0);
  }
});

// ── loadTalentSurfaceNotifications ──────────────────────────────────────────

test("loadTalentSurfaceNotifications: A impersonating B reads B's talent rows via service client", async () => {
  const calls: Call[] = [];
  await loadTalentSurfaceNotifications(impersonating, notifDeps(calls));
  assert.deepEqual(idsOf(calls, "admin", "user_notifications"), [B, "talent"]);
  assert.equal(calls.filter((c) => c.client === "rls").length, 0);
});

test("loadTalentSurfaceNotifications: no impersonation and forged context read the actor via RLS", async () => {
  for (const ctx of [undefined, forgedForOtherActor, unverifiedClaim]) {
    const calls: Call[] = [];
    await loadTalentSurfaceNotifications(ctx, notifDeps(calls));
    assert.deepEqual(idsOf(calls, "rls", "user_notifications"), [A, "talent"]);
    assert.equal(calls.filter((c) => c.client === "admin").length, 0);
  }
});

// ── loadTalentActor / loadTalentVisibleInquiryIds ───────────────────────────

function actorDeps(calls: Call[]) {
  return {
    rlsClient: async () => fakeClient("rls", calls, { userId: A }),
    adminClient: () => fakeClient("admin", calls, { data: (t) => (t === "talent_profiles" ? [{ id: "tp", is_demo: false }] : []) }),
  };
}

test("loadTalentActor: A impersonating B resolves B's talent profile; actor id is never queried", async () => {
  const calls: Call[] = [];
  const actor = await loadTalentActor(impersonating, actorDeps(calls));
  assert.ok(actor.ok);
  assert.equal(actor.ok && actor.userId, B);
  assert.deepEqual(idsOf(calls, "admin", "talent_profiles"), [B]);
});

test("loadTalentActor: no context and forged context resolve the real user", async () => {
  for (const ctx of [undefined, forgedForOtherActor, unverifiedClaim]) {
    const calls: Call[] = [];
    const actor = await loadTalentActor(ctx, actorDeps(calls));
    assert.equal(actor.ok && actor.userId, A);
    assert.deepEqual(idsOf(calls, "admin", "talent_profiles"), [A]);
  }
});

test("loadTalentVisibleInquiryIds: resolves the acting-as talent from B, not A", async () => {
  const calls: Call[] = [];
  await loadTalentVisibleInquiryIds(impersonating, actorDeps(calls)).catch(() => null);
  assert.deepEqual(idsOf(calls, "admin", "talent_profiles"), [B]);
  const calls2: Call[] = [];
  await loadTalentVisibleInquiryIds(undefined, actorDeps(calls2)).catch(() => null);
  assert.deepEqual(idsOf(calls2, "admin", "talent_profiles"), [A]);
  const calls3: Call[] = [];
  await loadTalentVisibleInquiryIds(forgedForOtherActor, actorDeps(calls3)).catch(() => null);
  assert.deepEqual(idsOf(calls3, "admin", "talent_profiles"), [A]);
});

// ── requireTalentSelf / loadTalentPersonalSiteDashboardState ────────────────

function selfDeps(seen: { profileFor: string[] }) {
  return {
    requireSession: async () =>
      ({ ok: true, supabase: {} as SupabaseClient, user: { id: A }, profile: null }) as never,
    loadProfileByUser: async (userId: string) => {
      seen.profileFor.push(userId);
      return { id: `profile-of-${userId}`, profileCode: "CODE", talentPlanKey: "talent_basic", isPubliclyHidden: false } as never;
    },
  };
}

test("requireTalentSelf: A impersonating B loads B's profile; no context and forged load A's", async () => {
  const seen = { profileFor: [] as string[] };
  await requireTalentSelf(impersonating, selfDeps(seen));
  await requireTalentSelf(undefined, selfDeps(seen));
  await requireTalentSelf(forgedForOtherActor, selfDeps(seen));
  await requireTalentSelf(unverifiedClaim, selfDeps(seen));
  assert.deepEqual(seen.profileFor, [B, A, A, A]);
});

function siteDeps(seen: { ctx: Array<EffectiveReadContext | undefined> }, calls: Call[]) {
  return {
    requireTalentSelf: (async (ctx?: EffectiveReadContext) => {
      seen.ctx.push(ctx);
      const userId = readUserId(A, ctx);
      return {
        ok: true,
        session: { user: { id: A } },
        tenantId: "",
        tenantSlug: "",
        talentProfile: { id: `profile-of-${userId}`, profileCode: "CODE", isPubliclyHidden: false },
        planKey: "talent_basic",
      } as never;
    }) as never,
    admin: () => fakeClient("admin", calls),
  };
}

test("loadTalentPersonalSiteDashboardState: A impersonating B reads B's site and writes nothing", async () => {
  const seen = { ctx: [] as Array<EffectiveReadContext | undefined> };
  const calls: Call[] = [];
  const res = await loadTalentPersonalSiteDashboardState(undefined, impersonating, siteDeps(seen, calls));
  assert.ok(res.ok);
  assert.equal(res.ok && res.state.talentProfileId, `profile-of-${B}`);
  assert.deepEqual(seen.ctx, [impersonating]);
  assert.ok(!calls.some((c) => c.eq.some(([, v]) => v === `profile-of-${A}`)));
});

test("loadTalentPersonalSiteDashboardState: no impersonation is unchanged (actor's profile)", async () => {
  for (const ctx of [undefined, forgedForOtherActor, unverifiedClaim]) {
    const seen = { ctx: [] as Array<EffectiveReadContext | undefined> };
    const res = await loadTalentPersonalSiteDashboardState(undefined, ctx, siteDeps(seen, []));
    assert.equal(res.ok && res.state.talentProfileId, `profile-of-${A}`);
  }
});

// ── loadClientSelfProfile ───────────────────────────────────────────────────

function clientDeps(calls: Call[]) {
  const data = (table: string) => {
    if (table === "client_profiles") return { id: "cp", company_name: null, profiles: { display_name: "Name" } };
    if (table === "agency_client_relationships") return { id: "rel" };
    return { display_name: "Agency", slug: "agency" };
  };
  return {
    rlsClient: async () => fakeClient("rls", calls, { userId: A, data }),
    adminClient: () => fakeClient("admin", calls, { data }),
  };
}

test("loadClientSelfProfile: A impersonating B reads B's client_profiles with the service client, not A's", async () => {
  const calls: Call[] = [];
  const res = await loadClientSelfProfile(B, TENANT, impersonating, clientDeps(calls));
  assert.equal(res?.userId, B);
  assert.deepEqual(idsOf(calls, "admin", "client_profiles"), [B]);
  assert.deepEqual(idsOf(calls, "rls", "client_profiles"), []);
  assert.ok(!calls.some((c) => c.eq.some(([, v]) => v === A)));
});

test("loadClientSelfProfile: no impersonation keeps the RLS client; a forged or mismatched context does too", async () => {
  const cases: Array<[string, EffectiveReadContext | undefined]> = [
    [A, undefined],
    [A, forgedForOtherActor],
    [B, unverifiedClaim],
    ["third", impersonating],
  ];
  for (const [uid, ctx] of cases) {
    const calls: Call[] = [];
    await loadClientSelfProfile(uid, TENANT, ctx, clientDeps(calls));
    assert.deepEqual(idsOf(calls, "rls", "client_profiles"), [uid]);
    assert.deepEqual(idsOf(calls, "admin", "client_profiles"), []);
  }
});

// ── loadClientTrustBillingState ─────────────────────────────────────────────

test("loadClientTrustBillingState: verified impersonation reads B with the service client; otherwise the session client", async () => {
  const admin = { tag: "admin" } as unknown as SupabaseClient;
  const seen: Array<[string, string, SupabaseClient | undefined]> = [];
  const load = (async (u: string, t: string, c?: SupabaseClient) => {
    seen.push([u, t, c]);
    return null;
  }) as never;
  await loadClientTrustBillingState(B, TENANT, impersonating, load, () => admin);
  await loadClientTrustBillingState(A, TENANT, undefined, load, () => admin);
  await loadClientTrustBillingState(A, TENANT, forgedForOtherActor, load, () => admin);
  await loadClientTrustBillingState(B, TENANT, unverifiedClaim, load, () => admin);
  assert.deepEqual(seen, [
    [B, TENANT, admin],
    [A, TENANT, undefined],
    [A, TENANT, undefined],
    [B, TENANT, undefined],
  ]);
});

test("loadClientTrustBillingState: verified impersonation with no service client reads nothing (default state)", async () => {
  let called = false;
  const load = (async () => {
    called = true;
    return null;
  }) as never;
  const state = await loadClientTrustBillingState(B, TENANT, impersonating, load, () => null);
  assert.equal(called, false);
  assert.equal(state.trustLevel, "basic");
});

// ── saved talents + favourites ──────────────────────────────────────────────

function discoveryDeps(calls: Call[]) {
  return {
    session: async () => ({ user: { id: A }, supabase: fakeClient("rls", calls) }),
    adminClient: () => fakeClient("admin", calls, { data: () => [{ talent_profile_id: "t1" }] }),
  };
}

test("saved talents + favourites: A impersonating B read B's rows with the service client", async () => {
  for (const [load, table] of [
    [loadSavedTalentIdsForContext, "saved_talent"],
    [loadFavoriteTalentIdsForContext, "client_favorites"],
  ] as const) {
    const calls: Call[] = [];
    const ids = await load(impersonating, discoveryDeps(calls));
    assert.deepEqual(ids, ["t1"]);
    assert.deepEqual(idsOf(calls, "admin", table), [B]);
    assert.equal(calls.filter((c) => c.client === "rls").length, 0);
  }
});

test("saved talents + favourites: no impersonation and forged context read the actor via RLS", async () => {
  for (const [load, table] of [
    [loadSavedTalentIdsForContext, "saved_talent"],
    [loadFavoriteTalentIdsForContext, "client_favorites"],
  ] as const) {
    for (const ctx of [undefined, forgedForOtherActor, unverifiedClaim]) {
      const calls: Call[] = [];
      await load(ctx, discoveryDeps(calls));
      assert.deepEqual(idsOf(calls, "rls", table), [A]);
      assert.equal(calls.filter((c) => c.client === "admin").length, 0);
    }
  }
});

// ── the layouts feed the loaders from the context, not the session ──────────

const WEB = join(new URL(".", import.meta.url).pathname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(WEB, rel), "utf8");

test("talent layout: shell loaders take the effective context, not session.user.id", () => {
  const src = read("src/app/(workspace)/talent/_talent-layout-inner.tsx");
  assert.match(src, /effectiveReadContext\(/);
  assert.match(src, /loadTalentSelfProfileByUser\(subjectUserId\)/);
  assert.match(src, /loadTalentPersonalSiteDashboardState\(undefined, readCtx/);
  assert.match(src, /loadTalentSurfaceNotifications\(readCtx\)/);
  assert.match(src, /loadTalentVisibleInquiryIds\(readCtx\)/);
  assert.doesNotMatch(src, /loadTalentSelfProfileByUser\(session\.user\.id\)/);
  assert.doesNotMatch(src, /loadProfileDisplayName\(session\.user\.id\)/);
});

test("client layout: portal loaders take the effective context, not session.user.id", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/client/layout.tsx");
  assert.match(src, /effectiveReadContext\(/);
  assert.match(src, /loadClientSelfProfile\(readCtx\.userId, scope\.tenantId, readCtx\)/);
  assert.match(src, /loadMyNotifications\(50, readCtx\)/);
  assert.match(src, /loadClientSubscription\(readCtx\.userId\)/);
  assert.match(src, /loadClientTrustBillingState\(readCtx\.userId, scope\.tenantId, readCtx\)/);
  assert.doesNotMatch(src, /loadClientSelfProfile\(session\.user\.id/);
  assert.doesNotMatch(src, /loadClientSubscription\(session\.user\.id/);
});
