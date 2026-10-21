import assert from "node:assert/strict";
import test from "node:test";

import { COORDINATOR_ROLE_CATALOG_ENTRIES } from "./catalog-entries-coordinator-role";
import { notifyCoordinatorRoleAssigned } from "./producers/coordinator-role-notify";

const entry = COORDINATOR_ROLE_CATALOG_ENTRIES[0]!;
const ev = (p: Record<string, unknown>) => ({ payload: p } as never);
const P = { role: "Mesero", eventTitle: "Boda Ana", startsAt: "2026-11-07T20:00:00Z", timeZone: "America/Cancun" };

test("the person gets only their own part, in their own language, as a bell", () => {
  assert.equal(entry.defaultChannels.join(), "in_app");
  assert.equal(entry.email, undefined);
  const es = String(entry.in_app!.body!(ev(P), { locale: "es" } as never));
  assert.match(es, /Estás en Boda Ana/);
  assert.match(es, /Tu rol: Mesero/);
  assert.match(es, /Tu llamado:/);
  const en = String(entry.in_app!.body!(ev({ ...P, role: "Waiter" }), { locale: "en" } as never));
  assert.match(en, /You are on|You're on|Your role: Waiter/i);
  assert.equal(entry.in_app!.title(ev(P), { locale: "es" } as never), "Tu rol en Boda Ana");
  assert.equal(entry.in_app!.title(ev(P), { locale: "en" } as never), "Your role in Boda Ana");
});

test("no call time yet: a plain 'will follow' line, never a made-up time", () => {
  const body = String(entry.in_app!.body!(ev({ ...P, startsAt: null }), { locale: "en" } as never));
  assert.match(body, /will follow/i);
});

test("the payload type carries no client, price or other-role fields", () => {
  const body = String(entry.in_app!.body!(ev({ ...P, otherRoles: ["DJ"], clientEmail: "x@y.z", priceCents: 5 }), { locale: "en" } as never));
  assert.doesNotMatch(body, /DJ|x@y\.z|\b5\b/);
});

function fakeAdmin(row: unknown, err: unknown = null) {
  const q: Record<string, unknown> = {};
  q.select = () => q; q.eq = () => q;
  q.maybeSingle = async () => ({ data: row, error: err });
  return { from: () => q } as never;
}
const args = { tenantId: "t", jobId: "j", roleId: "r", role: "Mesero", eventTitle: "Boda", startsAt: null, timeZone: "UTC", talentProfileId: "p" };

test("an unclaimed profile, a failed read or a thrown error tells nobody and never throws", async () => {
  assert.equal(await notifyCoordinatorRoleAssigned({ admin: fakeAdmin({ user_id: null }), ...args }), false);
  assert.equal(await notifyCoordinatorRoleAssigned({ admin: fakeAdmin(null, { message: "x" }), ...args }), false);
  const throwing = { from: () => { throw new Error("x"); } } as never;
  assert.equal(await notifyCoordinatorRoleAssigned({ admin: throwing, ...args }), false);
  assert.equal(await notifyCoordinatorRoleAssigned({ admin: fakeAdmin({ user_id: "u1" }), ...args }), true);
});
