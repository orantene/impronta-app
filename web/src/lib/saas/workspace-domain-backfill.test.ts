import assert from "node:assert/strict";
import test from "node:test";

import { filterBackfillPlan, planWorkspaceDomainBackfill } from "./workspace-domain-backfill";

const biz = (id: string, slug: string | null, status = "active") => ({ id, slug, status, workspace_type: "business" });

test("plans only business workspaces with no row for their platform hostname", () => {
  const { plan, skipped } = planWorkspaceDomainBackfill(
    [
      biz("t1", "qa-fresh-studio-2"),
      biz("t2", "has-row"),
      { id: "t3", slug: "agency-one", status: "active", workspace_type: "agency" },
      biz("t4", null),
      biz("t5", "gone", "cancelled"),
      biz("t6", "taken"),
    ],
    [
      { tenant_id: "t2", hostname: "has-row.tulala.digital" },
      { tenant_id: "other", hostname: "taken.tulala.digital" },
    ],
  );
  assert.deepEqual(plan, [{ tenantId: "t1", slug: "qa-fresh-studio-2", hostname: "qa-fresh-studio-2.tulala.digital" }]);
  assert.deepEqual(skipped.map((s) => [s.tenantId, s.reason]).sort(), [
    ["t4", "no_slug"],
    ["t5", "retired"],
    ["t6", "hostname_taken_by_other_tenant"],
  ]);
});

test("is idempotent: a second pass over the result plans nothing", () => {
  const agencies = [biz("t1", "a"), biz("t2", "b")];
  const first = planWorkspaceDomainBackfill(agencies, []);
  assert.equal(first.plan.length, 2);
  const rows = first.plan.map((p) => ({ tenant_id: p.tenantId, hostname: p.hostname }));
  assert.equal(planWorkspaceDomainBackfill(agencies, rows).plan.length, 0);
});

test("hostnames compare case-insensitively", () => {
  const { plan } = planWorkspaceDomainBackfill([biz("t1", "Mixed")], [{ tenant_id: "t1", hostname: "MIXED.tulala.digital" }]);
  assert.equal(plan.length, 0);
});

test("--only keeps just the named tenants (id or slug, case-insensitive)", () => {
  const { plan } = planWorkspaceDomainBackfill([biz("T1", "good-one"), biz("t2", "https-www-bad-com"), biz("t3", "good-two")], []);
  assert.deepEqual(filterBackfillPlan(plan, new Set(["good-one", "t3"])).map((p) => p.slug), ["good-one", "good-two"]);
  assert.deepEqual(filterBackfillPlan(plan, new Set(["t1"])).map((p) => p.slug), ["good-one"]);
  assert.deepEqual(filterBackfillPlan(plan, new Set()), []);
});
