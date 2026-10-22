/**
 * TUL-1448: the owner hears (email + bell, ES + EN) when a member declines or ends a station rent plan.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { findCatalogEntries } from "./catalog";
import { getEmailCopy } from "./email-copy";

const recipient = (locale: string) => ({ locale, displayName: "Owen" }) as never;
const event = (type: string) => ({ type, tenantId: "t1", eventId: "e1", payload: { memberName: "Tina" } }) as never;

test("both events have a catalog entry for the workspace owner, email + in_app, ES and EN", () => {
  for (const [type, en, es] of [
    ["rent.plan_declined", "Tina declined the station rent", "Tina rechazó la renta del puesto"],
    ["rent.plan_ended_by_member", "Tina ended their station rent", "Tina terminó su renta del puesto"],
  ] as const) {
    const [entry] = findCatalogEntries(type);
    assert.ok(entry, type);
    assert.deepEqual([...entry!.defaultChannels].sort(), ["email", "in_app"]);
    assert.equal(entry!.in_app!.title(event(type), recipient("en")), en);
    assert.equal(entry!.in_app!.title(event(type), recipient("es")), es);
    assert.equal(entry!.email!.subject(event(type), recipient("es")), es);
  }
});

test("email copy exists in EN and ES with no em dashes", () => {
  for (const locale of ["en", "es"]) {
    const c = getEmailCopy(locale);
    for (const key of ["rent.plan_declined", "rent.plan_ended"] as const) {
      for (const v of Object.values(c[key])) assert.ok(typeof v === "string" && v.length > 0 && !v.includes("—"), `${locale} ${key}`);
    }
  }
});

test("the producer dedupes on plan id + outcome and goes through the dispatcher", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/notifications/producers/rent-notify.ts"), "utf8");
  assert.match(src, /eventId: `rent-plan:\$\{planId\}:\$\{outcome\}`/);
  assert.match(src, /dispatchEventNotifications\(/);
});

// ---- TUL-1590 / TUL-1483: another tenant's talent name never goes into the email ----

import { rentPlanBelongsToTenant } from "./producers/rent-notify";

function planAdmin(plans: Array<{ id: string; tenant_id: string; talent_profile_id: string }>, error = false) {
  const filters: Record<string, unknown> = {};
  const q: Record<string, unknown> = {};
  Object.assign(q, {
    select: () => q,
    eq: (c: string, v: unknown) => ((filters[c] = v), q),
    maybeSingle: async () => {
      if (error) return { data: null, error: { message: "x" } };
      const hit = plans.find((p) => Object.entries(filters).every(([c, v]) => (p as Record<string, unknown>)[c] === v));
      return { data: hit ? { id: hit.id } : null, error: null };
    },
  });
  return { from: () => q } as never;
}

test("the plan must belong to the tenant AND the talent before anything is sent", async () => {
  const admin = () => planAdmin([{ id: "plan1", tenant_id: "t1", talent_profile_id: "tp1" }]);
  assert.equal(await rentPlanBelongsToTenant(admin(), { tenantId: "t1", planId: "plan1", talentProfileId: "tp1" }), true);
  assert.equal(await rentPlanBelongsToTenant(admin(), { tenantId: "t2", planId: "plan1", talentProfileId: "tp1" }), false, "another tenant");
  assert.equal(await rentPlanBelongsToTenant(admin(), { tenantId: "t1", planId: "plan1", talentProfileId: "tp2" }), false, "another tenant's talent");
  assert.equal(await rentPlanBelongsToTenant(admin(), { tenantId: "t1", planId: "nope", talentProfileId: "tp1" }), false);
});

test("a read error fails closed: nothing is sent", async () => {
  assert.equal(await rentPlanBelongsToTenant(planAdmin([], true), { tenantId: "t1", planId: "p", talentProfileId: "tp" }), false);
});

test("the producer checks ownership before it reads the talent's name", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/notifications/producers/rent-notify.ts"), "utf8");
  assert.ok(src.indexOf("rentPlanBelongsToTenant(") < src.indexOf('from("talent_profiles")'), "ownership first");
});

test("both member actions notify the owner after the plan row was updated and audited", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/service-hub/rent/rent-actions.ts"), "utf8");
  const respond = src.slice(src.indexOf("export async function respondRentPlan"), src.indexOf("export async function memberEndRentPlan"));
  const end = src.slice(src.indexOf("export async function memberEndRentPlan"));
  assert.match(respond, /if \(!input\.accept\) \{[\s\S]*notifyRentPlanMemberResponse\(\{[\s\S]*outcome: "declined"/);
  assert.match(end, /notifyRentPlanMemberResponse\(\{[\s\S]*outcome: "ended"/);
  assert.ok(respond.indexOf("logWorkspaceAudit") < respond.indexOf("notifyRentPlanMemberResponse"));
  assert.ok(end.indexOf("logWorkspaceAudit") < end.indexOf("notifyRentPlanMemberResponse"));
  // accepting never notifies
  assert.doesNotMatch(respond.replace(/if \(!input\.accept\) \{[\s\S]*?\n    \}\n/, ""), /notifyRentPlanMemberResponse/);
});
