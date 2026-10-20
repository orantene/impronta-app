import test from "node:test";
import assert from "node:assert/strict";

import { planServiceSlugWrite, serviceSlugProblem, serviceSlugScopeKey, type ServiceSlugRow } from "./service-slug-write";
import { serviceSlug } from "./service-page";

const TP = "11111111-0000-4000-8000-000000000001";
const TP2 = "11111111-0000-4000-8000-000000000002";
const TEN = "22222222-0000-4000-8000-000000000001";
const TEN2 = "22222222-0000-4000-8000-000000000002";

const talentRow = (id: string, slug: string | null, o: Partial<ServiceSlugRow> = {}): ServiceSlugRow => ({
  id, slug, owner_kind: "talent", talent_profile_id: TP, tenant_id: TEN, ...o,
});
const workspaceRow = (id: string, slug: string | null, o: Partial<ServiceSlugRow> = {}): ServiceSlugRow => ({
  id, slug, owner_kind: "workspace", talent_profile_id: null, tenant_id: TEN, ...o,
});
const me = (o: Partial<ServiceSlugRow> & { slugHistory?: string[]; title?: string } = {}) => ({
  ...talentRow("3fa91c2b-1111-4222-8333-444455556666", null),
  title: "Corte de cabello",
  slugHistory: [] as string[],
  ...o,
});

test("scope key mirrors the held unique indexes", () => {
  assert.equal(serviceSlugScopeKey(talentRow("a", null)), `talent:${TP}`);
  assert.equal(serviceSlugScopeKey(workspaceRow("b", null)), `workspace:${TEN}`);
  assert.equal(serviceSlugScopeKey({ owner_kind: "workspace", tenant_id: null }), null);
});

test("cross-scope: talent-owned and business-owned rows with the same slug do not collide", () => {
  const siblings = [workspaceRow("w1", "corte-clasico"), talentRow("t9", "corte-clasico", { talent_profile_id: TP2 })];
  const plan = planServiceSlugWrite({ row: me(), requested: "corte-clasico", siblings });
  assert.deepEqual(plan.ok && plan.slug, "corte-clasico");
  const bizPlan = planServiceSlugWrite({
    row: { ...workspaceRow("w2", null, { tenant_id: TEN2 }), title: "Corte", slugHistory: [] },
    requested: "corte-clasico",
    siblings,
  });
  assert.equal(bizPlan.ok, true, "a business in another tenant may use it");
});

test("within a scope the same slug collides (talent per profile across tenants; business per tenant)", () => {
  const sameTalentOtherTenant = talentRow("t2", "corte-clasico", { tenant_id: TEN2 });
  assert.deepEqual(planServiceSlugWrite({ row: me(), requested: "Corte-Clasico", siblings: [sameTalentOtherTenant] }), {
    ok: false,
    reason: "taken",
  });
  const biz = { ...workspaceRow("w2", null), title: "Corte", slugHistory: [] };
  assert.deepEqual(planServiceSlugWrite({ row: biz, requested: "corte-clasico", siblings: [workspaceRow("w1", "corte-clasico")] }), {
    ok: false,
    reason: "taken",
  });
  assert.equal(planServiceSlugWrite({ row: me({ slug: "corte-clasico" }), requested: "corte-clasico", siblings: [talentRow(me().id, "corte-clasico")] }).ok, true, "own row is not a collision");
});

test("reserved, malformed and derived-grammar slugs are refused at write", () => {
  assert.equal(serviceSlugProblem("book"), "reserved");
  assert.equal(serviceSlugProblem("ES"), "reserved");
  assert.equal(serviceSlugProblem("corte clasico"), "invalid");
  assert.equal(serviceSlugProblem("servicio-corte-3fa91c2b"), "invalid");
  assert.equal(serviceSlugProblem("corte-clasico"), null);
  assert.deepEqual(planServiceSlugWrite({ row: me(), requested: "admin", siblings: [] }), { ok: false, reason: "reserved" });
});

test("changing the slug moves the old answering slug into history (newest first, deduped)", () => {
  const first = planServiceSlugWrite({ row: me(), requested: "corte-clasico", siblings: [] });
  assert.deepEqual(first, { ok: true, changed: true, slug: "corte-clasico", slugHistory: [serviceSlug(me())] });
  const second = planServiceSlugWrite({
    row: me({ slug: "corte-clasico", slugHistory: [serviceSlug(me())] }),
    requested: "corte-premium",
    siblings: [],
  });
  assert.deepEqual(second.ok && second.slugHistory, ["corte-clasico", serviceSlug(me())]);
  const back = planServiceSlugWrite({ row: me({ slug: "corte-premium", slugHistory: ["corte-clasico"] }), requested: "corte-clasico", siblings: [] });
  assert.deepEqual(back.ok && back.slugHistory, ["corte-premium"], "the slug in use never stays in history");
});

test("rename with no custom slug records the old derived slug; unchanged save is a no-op", () => {
  const plan = planServiceSlugWrite({ row: me(), nextTitle: "Corte premium", requested: null, siblings: [] });
  assert.deepEqual(plan, { ok: true, changed: true, slug: null, slugHistory: [serviceSlug(me())] });
  assert.deepEqual(planServiceSlugWrite({ row: me(), requested: "", siblings: [] }), { ok: true, changed: false, slug: null, slugHistory: [] });
});

test("history is capped at 50 (the migration check)", () => {
  const long = Array.from({ length: 60 }, (_, i) => `viejo-${i}`);
  const plan = planServiceSlugWrite({ row: me({ slug: "corte-clasico", slugHistory: long }), requested: "corte-nuevo", siblings: [] });
  assert.equal(plan.ok && plan.slugHistory.length, 50);
  assert.equal(plan.ok && plan.slugHistory[0], "corte-clasico");
});
