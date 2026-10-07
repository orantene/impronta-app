// P0 2026-10-07 — multi-talent hub sends must not put two independent talents
// on one inquiry (cross-talent offer / thread access), and offer writes must
// not reach another talent's offer. Run:
//   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' npx tsx --test src/lib/discover/hub-split-independent-talents.test.ts
import { strict as assert } from "node:assert";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const WEB = process.cwd();
const ROUTE = readFileSync(join(WEB, "src/app/api/discover/inquiry/route.ts"), "utf8");
const SUBMIT = readFileSync(join(WEB, "src/lib/inquiry/inquiry-engine-submit.ts"), "utf8");
const MIGRATIONS_DIR = join(WEB, "../supabase/migrations");

describe("planDiscoverFanout — one inquiry per independent talent", () => {
  it("2 independent talents → 2 groups, each with exactly one talent", async () => {
    const { planDiscoverFanout } = await import("./inquiry-fanout-plan");
    const { groups } = planDiscoverFanout({
      rosterGroups: new Map(),
      noRosterTalents: ["tA", "tB"],
      channelTenantId: "host",
    });
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map((g) => g.talentIds), [["tA"], ["tB"]]);
    assert.ok(groups.every((g) => g.tenantId === "host" && g.independent));
  });

  it("agency roster groups keep today's behaviour (shared inquiry per agency)", async () => {
    const { planDiscoverFanout } = await import("./inquiry-fanout-plan");
    const { groups } = planDiscoverFanout({
      rosterGroups: new Map([["agency1", ["r1", "r2"]], ["host", ["r3"]]]),
      noRosterTalents: ["tA"],
      channelTenantId: "host",
    });
    assert.deepEqual(groups, [
      { tenantId: "agency1", talentIds: ["r1", "r2"], independent: false },
      // the host's rostered talent is NOT merged with the independent one
      { tenantId: "host", talentIds: ["r3"], independent: false },
      { tenantId: "host", talentIds: ["tA"], independent: true },
    ]);
  });

  it("unresolved host → independents are returned unrouted (legacy no_roster skip)", async () => {
    const { planDiscoverFanout } = await import("./inquiry-fanout-plan");
    const r = planDiscoverFanout({ rosterGroups: new Map(), noRosterTalents: ["tA"], channelTenantId: null });
    assert.deepEqual(r, { groups: [], unroutedIndependent: ["tA"] });
  });

  it("route fans out over the plan — one submitInquiry per group, never a folded host bucket", () => {
    assert.match(ROUTE, /planDiscoverFanout\(/);
    assert.match(ROUTE, /for \(const \{ tenantId, talentIds: ids \} of fanoutGroups\)/);
    assert.doesNotMatch(ROUTE, /bucket\.push\(\.\.\.noRosterTalents\)/);
  });
});

describe("submitInquiry — at most one talent coordinator per inquiry", () => {
  it("the self-coordination loop refuses a second talent coordinator", () => {
    const start = SUBMIT.indexOf("// Hub self-coordination");
    assert.ok(start >= 0);
    const block = SUBMIT.slice(start, start + 2500);
    assert.match(block, /talentCoordSeated/);
    assert.match(block, /secondTalentCoordinatorRefused/);
  });
});

function latestPolicySql(policy: string): { file: string; sql: string } {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  let found: { file: string; sql: string } | null = null;
  const re = new RegExp(`CREATE POLICY\\s+"?${policy}"?\\s+ON[\\s\\S]*?;`, "g");
  for (const f of files) {
    const src = readFileSync(join(MIGRATIONS_DIR, f), "utf8");
    const all = src.match(re);
    if (all) found = { file: f, sql: all[all.length - 1] };
  }
  assert.ok(found, `no CREATE POLICY for ${policy}`);
  return found;
}

describe("offer write policies (static assertion on the LATEST migration defining each)", () => {
  for (const policy of ["inquiry_offers_coordinator_update", "inquiry_offer_line_items_merged_all_public"]) {
    it(`${policy}: coordinator branch excludes offers authored by another talent`, () => {
      const { file, sql } = latestPolicySql(policy);
      assert.match(sql, /created_by_user_id/, `${file} does not check offer authorship`);
      assert.match(sql, /NOT EXISTS[\s\S]*role = 'talent'/, `${file} lacks the other-talent exclusion`);
      assert.match(sql, /is_staff_of_tenant\(tenant_id\)/, `${file} dropped the agency staff path`);
    });
  }

  it("inquiry_offers_coordinator_write: a coordinator can only insert as themselves", () => {
    const { file, sql } = latestPolicySql("inquiry_offers_coordinator_write");
    assert.match(sql, /created_by_user_id = \(SELECT auth\.uid\(\)\)/, `${file} lets coordinators forge authorship`);
    assert.match(sql, /is_staff_of_tenant\(tenant_id\)/);
  });
});
