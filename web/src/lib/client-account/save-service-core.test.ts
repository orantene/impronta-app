/**
 * TUL-1692 (follow-up to TUL-1463, PR #4232): saving a service
 *  - is refused when the client account surface is off for this request's host
 *    (`accountSurfaceEnabledForRequest`, like every other client account action);
 *  - on a hub talent site (her own site, the shared Tulala hub tenant) is scoped to the
 *    HOST talent: another hub talent's service is refused, and the Saved list shows only
 *    the host talent's services, not every hub talent's;
 *  - still works for the normal case.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { runSetServiceSaved, type SaveServiceAdmin, type SaveServiceDeps } from "./save-service-core";
import { decideServiceSave, shapeSavedServices, type SavedServiceOffering, type SavedServiceRow, type SavedServiceSite } from "./saved-services";

const OFFERING = "aaaaaaaa-1111-4111-8111-111111111111";
const HUB = "hub-tenant";
const HOST_TALENT = "tp-host";
const OTHER_TALENT = "tp-other";

type Reply = { data: unknown; error: { code?: string | null } | null };
type FakeQuery = {
  select: (...a: unknown[]) => FakeQuery;
  eq: (...a: unknown[]) => FakeQuery;
  delete: (...a: unknown[]) => FakeQuery;
  upsert: (...a: unknown[]) => FakeQuery;
  maybeSingle: () => Promise<Reply>;
  then: (r: (v: Reply) => unknown) => unknown;
  [k: string]: unknown;
};

/** A fake service-role client: `offering` answers the talent_offerings read; every call is logged. */
function fakeAdmin(offering: Record<string, unknown> | null) {
  const calls: string[] = [];
  const upserts: unknown[] = [];
  const admin = {
    from(table: string) {
      let mode = "read";
      const q: FakeQuery = {
        select: () => q,
        eq: () => q,
        delete: () => {
          mode = "delete";
          return q;
        },
        upsert: (row: unknown) => {
          mode = "upsert";
          upserts.push(row);
          return q;
        },
        maybeSingle: async () => {
          calls.push(`${table}:read`);
          return { data: offering, error: null };
        },
        then: (resolve) => {
          calls.push(`${table}:${mode}`);
          return resolve({ data: null, error: null });
        },
      };
      return q;
    },
  } as unknown as SaveServiceAdmin;
  return { admin, calls, upserts };
}

const visible = (over: Record<string, unknown> = {}) => ({
  id: OFFERING, tenant_id: HUB, talent_profile_id: HOST_TALENT, status: "published", moderation_state: "approved", visibility: "public", ...over,
});

function deps(over: Partial<SaveServiceDeps> & { admin: SaveServiceAdmin }): SaveServiceDeps {
  return {
    notImpersonating: async () => true,
    surfaceEnabled: async () => true,
    session: async () => ({ userId: "client-1", appRole: "client" }),
    tenant: async () => ({ tenantId: HUB, hubTalentProfileId: HOST_TALENT }),
    logError: () => undefined,
    ...over,
  };
}

test("the account surface off for this site: the save is refused and nothing is read or written", async () => {
  for (const saved of [true, false]) {
    const { admin, calls } = fakeAdmin(visible());
    const r = await runSetServiceSaved(deps({ admin, surfaceEnabled: async () => false }), { offeringId: OFFERING, saved });
    assert.deepEqual(r, { ok: false, reason: "unavailable" });
    assert.deepEqual(calls, [], "no database call when the surface is off");
  }
});

test("the server action runs the surface check through accountSurfaceEnabledForRequest", () => {
  const action = readFileSync(join(process.cwd(), "src/lib/client-account/save-service-actions.ts"), "utf8");
  assert.match(action, /surfaceEnabled: accountSurfaceEnabledForRequest/);
  assert.match(action, /import \{[^}]*accountSurfaceEnabledForRequest[^}]*\} from "\.\/tenant\.server"/);
});

test("hub talent site: another hub talent's service is refused, nothing is written", async () => {
  const { admin, calls, upserts } = fakeAdmin(visible({ talent_profile_id: OTHER_TALENT }));
  const r = await runSetServiceSaved(deps({ admin }), { offeringId: OFFERING, saved: true });
  assert.deepEqual(r, { ok: false, reason: "not_found" });
  assert.deepEqual(upserts, []);
  assert.ok(!calls.includes("client_favorite_services:upsert"));
  // A hub house row (no talent) is not the host talent's either.
  const house = fakeAdmin(visible({ talent_profile_id: null }));
  assert.deepEqual(await runSetServiceSaved(deps({ admin: house.admin }), { offeringId: OFFERING, saved: true }), { ok: false, reason: "not_found" });
  // The pure decision says the same.
  assert.deepEqual(
    decideServiceSave({ sessionUserId: "u", siteTenantId: HUB, hubTalentProfileId: HOST_TALENT, offering: visible({ talent_profile_id: OTHER_TALENT }) }),
    { ok: false, reason: "not_found" },
  );
});

test("hub talent site: the host talent's own service saves", async () => {
  const { admin, calls, upserts } = fakeAdmin(visible());
  const r = await runSetServiceSaved(deps({ admin }), { offeringId: OFFERING, saved: true });
  assert.deepEqual(r, { ok: true, saved: true });
  assert.deepEqual(upserts, [{ client_user_id: "client-1", offering_id: OFFERING, tenant_id: HUB }]);
  assert.deepEqual(calls, ["talent_offerings:read", "client_favorite_services:upsert"]);
});

test("the normal save still works: agency host (no hub talent scope) saves any visible service of its tenant", async () => {
  const { admin, upserts } = fakeAdmin(visible({ tenant_id: "agency-a", talent_profile_id: OTHER_TALENT }));
  const r = await runSetServiceSaved(deps({ admin, tenant: async () => ({ tenantId: "agency-a", hubTalentProfileId: null }) }), { offeringId: OFFERING, saved: true });
  assert.deepEqual(r, { ok: true, saved: true });
  assert.deepEqual(upserts, [{ client_user_id: "client-1", offering_id: OFFERING, tenant_id: "agency-a" }]);
  // Unsave touches only this client's own row.
  const del = fakeAdmin(null);
  assert.deepEqual(await runSetServiceSaved(deps({ admin: del.admin }), { offeringId: OFFERING, saved: false }), { ok: true, saved: false });
  assert.deepEqual(del.calls, ["client_favorite_services:delete"]);
});

test("guest, talent account and impersonation are refused before any database call", async () => {
  const cases: Array<[Partial<SaveServiceDeps>, string]> = [
    [{ session: async () => ({ userId: null, appRole: null }) }, "sign_in"],
    [{ session: async () => ({ userId: "t1", appRole: "talent" }) }, "not_client"],
    [{ notImpersonating: async () => false }, "unavailable"],
  ];
  for (const [over, reason] of cases) {
    const { admin, calls } = fakeAdmin(visible());
    assert.deepEqual(await runSetServiceSaved(deps({ admin, ...over }), { offeringId: OFFERING, saved: true }), { ok: false, reason });
    assert.deepEqual(calls, []);
  }
  const { admin } = fakeAdmin(visible());
  assert.deepEqual(await runSetServiceSaved(deps({ admin }), { offeringId: "nope", saved: true }), { ok: false, reason: "invalid" });
});

const offeringRow = (talent: string | null, id: string, title: string): SavedServiceRow => ({
  added_at: "2026-10-01T00:00:00Z",
  offering_id: id,
  tenant_id: HUB,
  talent_offerings: { ...visible({ id, talent_profile_id: talent }), title, kind: "service", owner_kind: "talent", attributes: {} } as SavedServiceOffering,
});

test("hub talent site: the Saved list reads only the host talent's services", () => {
  const rows = [
    offeringRow(HOST_TALENT, OFFERING, "Haircut"),
    offeringRow(OTHER_TALENT, "bbbbbbbb-2222-4222-8222-222222222222", "Other talent's nails"),
    offeringRow(null, "cccccccc-3333-4333-8333-333333333333", "Hub house row"),
  ];
  const hubSite: SavedServiceSite = { hostKind: "talent_site", hostTalentProfileId: HOST_TALENT, hubTalentProfileId: HOST_TALENT, businessPagesOn: false, nonMenuIds: new Set() };
  assert.deepEqual(shapeSavedServices(rows, HUB, "en", hubSite).map((s) => s.title), ["Haircut"]);
  // A tenant that is not the shared hub keeps the tenant-wide list (no hub talent scope).
  const agencySite: SavedServiceSite = { hostKind: "agency", hostTalentProfileId: null, hubTalentProfileId: null, businessPagesOn: false, nonMenuIds: new Set() };
  assert.equal(shapeSavedServices(rows, HUB, "en", agencySite).length, 3);
  // The talent-site renderer passes the hub talent scope from the host-resolved tenant.
  const render = readFileSync(join(process.cwd(), "src/lib/client-account/render-area.tsx"), "utf8");
  assert.match(render, /loadSavedServices\(userId, tenantId, locale, \{ hostKind: host\.hostContext, hostTalentProfileId: talentProfileId, hubTalentProfileId: tenant\.hubTalentProfileId \}\)/);
  // The tenant resolver sets the scope on EVERY talent site (hub or agency seller), never on other hosts.
  const tenantSrc = readFileSync(join(process.cwd(), "src/lib/client-account/tenant.server.ts"), "utf8");
  assert.match(tenantSrc, /hubTalentProfileId = talentProfileId;/);
  assert.doesNotMatch(tenantSrc, /seller === "hub" \? talentProfileId/);
  assert.equal((tenantSrc.match(/hubTalentProfileId = /g) ?? []).length, 1, "set only in the talent_profile branch");
});

test("agency-tenant talent site: another agency talent's service is refused, her own service saves", async () => {
  const agencyTalentSite = async () => ({ tenantId: "agency-a", hubTalentProfileId: HOST_TALENT });
  const other = fakeAdmin(visible({ tenant_id: "agency-a", talent_profile_id: OTHER_TALENT }));
  assert.deepEqual(await runSetServiceSaved(deps({ admin: other.admin, tenant: agencyTalentSite }), { offeringId: OFFERING, saved: true }), { ok: false, reason: "not_found" });
  assert.deepEqual(other.upserts, []);
  const own = fakeAdmin(visible({ tenant_id: "agency-a", talent_profile_id: HOST_TALENT }));
  assert.deepEqual(await runSetServiceSaved(deps({ admin: own.admin, tenant: agencyTalentSite }), { offeringId: OFFERING, saved: true }), { ok: true, saved: true });
  assert.deepEqual(own.upserts, [{ client_user_id: "client-1", offering_id: OFFERING, tenant_id: "agency-a" }]);
  // Her Saved list on the agency tenant is hers only.
  const rows = [
    { ...offeringRow(HOST_TALENT, OFFERING, "Haircut"), tenant_id: "agency-a" },
    { ...offeringRow(OTHER_TALENT, "bbbbbbbb-2222-4222-8222-222222222222", "Colleague's nails"), tenant_id: "agency-a" },
  ].map((r) => ({ ...r, talent_offerings: r.talent_offerings ? { ...r.talent_offerings, tenant_id: "agency-a" } : null }));
  const site: SavedServiceSite = { hostKind: "talent_site", hostTalentProfileId: HOST_TALENT, hubTalentProfileId: HOST_TALENT, businessPagesOn: false, nonMenuIds: new Set() };
  assert.deepEqual(shapeSavedServices(rows, "agency-a", "en", site).map((s) => s.title), ["Haircut"]);
});
