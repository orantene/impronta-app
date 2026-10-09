/**
 * TUL-484: a fresh inquiry on the owner's own workspace seats the coordinator and
 * the talent as 'invited'. Nobody else can accept for her, so the owner who is the
 * whole lineup must be able to start (and edit, send) the offer anyway.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { validateActorPermission } from "./inquiry-permissions";
import { ownerTalentOwnLineupOfferAllowed } from "./talent-self-inquiry";

const ME = "talent-me";
const USER = "user-me";

type Rows = {
  workspaceType?: string | null;
  profiles?: unknown;
  talent_profiles?: unknown;
  inquiry_participants_mine?: unknown[];
  inquiry_participants_lineup?: unknown[];
  inquiries?: unknown;
  agency_memberships?: unknown;
  errorOn?: string;
};

function fake(r: Rows) {
  return {
    from(table: string) {
      const ctx: { eqs: Array<[string, unknown]> } = { eqs: [] };
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => { ctx.eqs.push([c, v]); return q; },
        in: (c: string, v: unknown) => { ctx.eqs.push([`in:${c}`, v]); return q; },
        limit: () => q,
        maybeSingle: () => {
          if (r.errorOn === table) return Promise.resolve({ data: null, error: { message: "boom" } });
          if (table === "profiles") return Promise.resolve({ data: r.profiles ?? { app_role: "talent" }, error: null });
          if (table === "talent_profiles") return Promise.resolve({ data: r.talent_profiles ?? { id: ME }, error: null });
          if (table === "inquiries") return Promise.resolve({ data: r.inquiries ?? { tenant_id: "ws-own", owner_user_id: null, source_context: {} }, error: null });
          if (table === "agency_memberships") return Promise.resolve({ data: r.agency_memberships ?? null, error: null });
          if (table === "agencies") return Promise.resolve({ data: { workspace_type: r.workspaceType ?? "business" }, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (r.errorOn === table) return Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve);
          if (table === "inquiry_participants") {
            const mine = ctx.eqs.some(([c]) => c === "user_id");
            const liveFilter = ctx.eqs.find(([c]) => c === "in:status")?.[1] as string[] | undefined;
            const lineup = (r.inquiry_participants_lineup ?? []) as Array<{ status?: string }>;
            const rows = mine ? r.inquiry_participants_mine ?? [] : lineup.filter((x) => !liveFilter || liveFilter.includes(x.status ?? "invited"));
            return Promise.resolve({ data: rows, error: null }).then(resolve);
          }
          return Promise.resolve({ data: [], error: null }).then(resolve);
        },
      };
      return q;
    },
  } as never;
}

const INVITED = [{ role: "talent", status: "invited", talent_profile_id: ME }, { role: "coordinator", status: "invited", talent_profile_id: null }];

test("the owner talent who is the whole lineup can start an offer while still only invited", async () => {
  const res = await validateActorPermission(
    fake({ inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME, status: "invited" }], agency_memberships: { id: "m1" } }),
    "inq-1", USER, "create_offer",
  );
  assert.equal(res.ok, true);
});

test("update and send are hers too", async () => {
  const sb = fake({ inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME, status: "invited" }], agency_memberships: { id: "m1" } });
  assert.equal((await validateActorPermission(sb, "inq-1", USER, "update_offer")).ok, true);
  assert.equal((await validateActorPermission(sb, "inq-1", USER, "send_offer")).ok, true);
});

test("a talent who is not the owner of the workspace is still refused", async () => {
  const res = await validateActorPermission(
    fake({ inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME, status: "invited" }], agency_memberships: null }),
    "inq-1", USER, "create_offer",
  );
  assert.equal(res.ok, false);
});

test("the owner is refused when another talent is on the lineup", async () => {
  const res = await validateActorPermission(
    fake({ inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME, status: "invited" }, { talent_profile_id: "other", status: "active" }], agency_memberships: { id: "m1" } }),
    "inq-1", USER, "create_offer",
  );
  assert.equal(res.ok, false);
});

test("a DECLINED second talent is not on the lineup; her own declined seat does not count either", async () => {
  const withDeclinedOther = fake({ inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME, status: "invited" }, { talent_profile_id: "other", status: "declined" }], agency_memberships: { id: "m1" } });
  assert.equal((await validateActorPermission(withDeclinedOther, "inq-1", USER, "create_offer")).ok, true);
  const myOwnSeatDeclined = fake({ inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME, status: "declined" }], agency_memberships: { id: "m1" } });
  assert.equal((await validateActorPermission(myOwnSeatDeclined, "inq-1", USER, "create_offer")).ok, false);
});

test("a HUB sale (talent-type workspace, no owner membership): hers alone is enough; two live talents or a business workspace are not", async () => {
  const alone = { inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME, status: "invited" }], agency_memberships: null, workspaceType: "talent" };
  assert.equal((await validateActorPermission(fake(alone), "inq-1", USER, "create_offer")).ok, true);
  assert.equal((await validateActorPermission(fake({ ...alone, workspaceType: "business" }), "inq-1", USER, "create_offer")).ok, false);
  assert.equal(
    (await validateActorPermission(fake({ ...alone, inquiry_participants_lineup: [{ talent_profile_id: ME, status: "active" }, { talent_profile_id: "other", status: "invited" }] }), "inq-1", USER, "create_offer")).ok,
    false,
  );
});

test("the talent profile is the actor's own (loaded by user_id) before the gate runs", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync("src/lib/inquiry/inquiry-permissions.ts", "utf8");
  assert.match(src, /const talentProfileId = await loadTalentProfileIdForUser\(supabase, actorUserId\);/);
  assert.match(src, /\.from\("talent_profiles"\)[\s\S]{0,40}\.select\("id"\)[\s\S]{0,40}\.eq\("user_id", userId\)/);
});

test("a failed owner read fails closed", async () => {
  const res = await validateActorPermission(
    fake({ inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME, status: "invited" }], agency_memberships: { id: "m1" }, errorOn: "agency_memberships" }),
    "inq-1", USER, "create_offer",
  );
  assert.equal(res.ok, false);
});

test("pure rule", () => {
  const base = { actorTalentProfileId: ME, liveTalentProfileIds: [ME], actorIsActiveWorkspaceOwner: true, tenantIsTalentWorkspace: false };
  assert.equal(ownerTalentOwnLineupOfferAllowed(base), true);
  assert.equal(ownerTalentOwnLineupOfferAllowed({ ...base, actorIsActiveWorkspaceOwner: false }), false);
  assert.equal(ownerTalentOwnLineupOfferAllowed({ ...base, actorIsActiveWorkspaceOwner: false, tenantIsTalentWorkspace: true }), true);
  assert.equal(ownerTalentOwnLineupOfferAllowed({ ...base, actorTalentProfileId: null }), false);
  assert.equal(ownerTalentOwnLineupOfferAllowed({ ...base, liveTalentProfileIds: [] }), false);
  assert.equal(ownerTalentOwnLineupOfferAllowed({ ...base, liveTalentProfileIds: ["other"] }), false);
});
