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
        in: () => q,
        limit: () => q,
        maybeSingle: () => {
          if (r.errorOn === table) return Promise.resolve({ data: null, error: { message: "boom" } });
          if (table === "profiles") return Promise.resolve({ data: r.profiles ?? { app_role: "talent" }, error: null });
          if (table === "talent_profiles") return Promise.resolve({ data: r.talent_profiles ?? { id: ME }, error: null });
          if (table === "inquiries") return Promise.resolve({ data: r.inquiries ?? { tenant_id: "ws-own", owner_user_id: null, source_context: {} }, error: null });
          if (table === "agency_memberships") return Promise.resolve({ data: r.agency_memberships ?? null, error: null });
          return Promise.resolve({ data: null, error: null });
        },
        then: (resolve: (v: unknown) => unknown) => {
          if (r.errorOn === table) return Promise.resolve({ data: null, error: { message: "boom" } }).then(resolve);
          if (table === "inquiry_participants") {
            const mine = ctx.eqs.some(([c]) => c === "user_id");
            const rows = mine ? r.inquiry_participants_mine ?? [] : r.inquiry_participants_lineup ?? [];
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
    fake({ inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME }], agency_memberships: { id: "m1" } }),
    "inq-1", USER, "create_offer",
  );
  assert.equal(res.ok, true);
});

test("update and send are hers too", async () => {
  const sb = fake({ inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME }], agency_memberships: { id: "m1" } });
  assert.equal((await validateActorPermission(sb, "inq-1", USER, "update_offer")).ok, true);
  assert.equal((await validateActorPermission(sb, "inq-1", USER, "send_offer")).ok, true);
});

test("a talent who is not the owner of the workspace is still refused", async () => {
  const res = await validateActorPermission(
    fake({ inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME }], agency_memberships: null }),
    "inq-1", USER, "create_offer",
  );
  assert.equal(res.ok, false);
});

test("the owner is refused when another talent is on the lineup", async () => {
  const res = await validateActorPermission(
    fake({ inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME }, { talent_profile_id: "other" }], agency_memberships: { id: "m1" } }),
    "inq-1", USER, "create_offer",
  );
  assert.equal(res.ok, false);
});

test("a failed owner read fails closed", async () => {
  const res = await validateActorPermission(
    fake({ inquiry_participants_mine: INVITED, inquiry_participants_lineup: [{ talent_profile_id: ME }], agency_memberships: { id: "m1" }, errorOn: "agency_memberships" }),
    "inq-1", USER, "create_offer",
  );
  assert.equal(res.ok, false);
});

test("pure rule", () => {
  assert.equal(ownerTalentOwnLineupOfferAllowed({ actorTalentProfileId: ME, talentProfileIds: [ME], actorIsActiveWorkspaceOwner: true }), true);
  assert.equal(ownerTalentOwnLineupOfferAllowed({ actorTalentProfileId: ME, talentProfileIds: [ME], actorIsActiveWorkspaceOwner: false }), false);
  assert.equal(ownerTalentOwnLineupOfferAllowed({ actorTalentProfileId: null, talentProfileIds: [ME], actorIsActiveWorkspaceOwner: true }), false);
  assert.equal(ownerTalentOwnLineupOfferAllowed({ actorTalentProfileId: ME, talentProfileIds: [], actorIsActiveWorkspaceOwner: true }), false);
});
