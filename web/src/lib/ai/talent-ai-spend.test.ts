/** TUL-320: per-talent AI spend is summed in SQL, the cap threshold is unchanged, and a failed read behaves as before. Lane: test:ai-guardrails. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { sumTalentAiSpendCents, type TalentSpendRpcClient } from "./talent-ai-spend";
import { HUB_TALENT_AI_SUBCAP, assertHubTalentAiAllowed, type HubTalentSubcapDeps } from "./hub-talent-subcap";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p: string) => readFileSync(join(SRC, p), "utf8");
const MIGRATION = readFileSync(join(SRC, "../../supabase/migrations/20261231431300_ai_spend_sum_tul320.sql"), "utf8");

function fakeRpc(result: { data: unknown; error: unknown }) {
  const calls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const client: TalentSpendRpcClient = {
    async rpc(fn, args) {
      calls.push({ fn, args });
      return result;
    },
  };
  return { client, calls };
}

describe("sumTalentAiSpendCents uses the SQL sum", () => {
  test("calls ai_talent_spend_cents once with the talent, month start, tenant and feature", async () => {
    const { client, calls } = fakeRpc({ data: 12345, error: null });
    const n = await sumTalentAiSpendCents(client, { talentProfileId: "t1", sinceIso: "2026-10-01T00:00:00.000Z", tenantId: "ten", feature: "booking_assistant" }, "x");
    assert.equal(n, 12345, "a total past 5000 rows is returned exactly");
    assert.deepEqual(calls, [{ fn: "ai_talent_spend_cents", args: { p_talent_profile_id: "t1", p_since: "2026-10-01T00:00:00.000Z", p_tenant_id: "ten", p_feature: "booking_assistant" } }]);
  });
  test("a bigint that arrives as a string is read as a number; null from SUM-less empty data is 0 via the SQL COALESCE", async () => {
    assert.equal(await sumTalentAiSpendCents(fakeRpc({ data: "700", error: null }).client, { talentProfileId: "t", sinceIso: "s" }, "x"), 700);
  });
  test("a query error or garbage total is null (the caller decides the failure policy)", async () => {
    assert.equal(await sumTalentAiSpendCents(fakeRpc({ data: null, error: { message: "boom" } }).client, { talentProfileId: "t", sinceIso: "s" }, "x"), null);
    assert.equal(await sumTalentAiSpendCents(fakeRpc({ data: "NaN", error: null }).client, { talentProfileId: "t", sinceIso: "s" }, "x"), null);
  });
});

describe("the cap threshold and failure policy are unchanged", () => {
  function deps(spend: number | null): HubTalentSubcapDeps {
    return {
      async readHubTenantId() { return null; },
      async readTalentSpendCents() { return spend; },
      async checkRpm() { return { ok: true }; },
    };
  }
  test("hub sub-cap: refused at exactly the cap, allowed one cent under", async () => {
    const cap = HUB_TALENT_AI_SUBCAP.monthlySpendCents;
    const at = await assertHubTalentAiAllowed({ talentProfileId: "t" }, deps(cap));
    assert.ok(!at.ok && at.code === "talent_spend_cap");
    assert.deepEqual(await assertHubTalentAiAllowed({ talentProfileId: "t" }, deps(cap - 1)), { ok: true });
  });
  test("hub sub-cap: an unreadable total still fails closed", async () => {
    const r = await assertHubTalentAiAllowed({ talentProfileId: "t" }, deps(null));
    assert.ok(!r.ok && r.code === "unavailable");
  });
  test("wiring: both callers use the RPC helper, no 5000-row load remains, and turn.server keeps its 0-on-error behaviour", () => {
    const hub = read("lib/ai/hub-talent-subcap.ts");
    const turn = read("lib/ai/booking-assistant/turn.server.ts");
    assert.match(hub, /sumTalentAiSpendCents\(/);
    assert.match(turn, /sumTalentAiSpendCents\(/);
    assert.match(turn, /return cents \?\? 0;/);
    assert.doesNotMatch(hub, /\.limit\(5000\)/);
    assert.doesNotMatch(turn, /talent-spend[\s\S]{0,40}\.limit\(5000\)/);
    assert.doesNotMatch(turn.slice(turn.indexOf("loadTalentBookingAssistantSpendCentsThisMonth")), /from\("cms_ai_usage_log"\)/);
  });
});

describe("migration ai_talent_spend_cents", () => {
  test("keeps the per-row rule (max(1, round(usd*100)), paid rows only) and the ok/month/tenant filters", () => {
    assert.match(MIGRATION, /GREATEST\(1, ROUND\(\(l\.context_jsonb ->> 'cost_usd'\)::numeric \* 100\)\)/);
    assert.match(MIGRATION, /jsonb_typeof\(l\.context_jsonb -> 'cost_usd'\) = 'number'/);
    assert.match(MIGRATION, /::numeric > 0/);
    assert.match(MIGRATION, /l\.ok = true/);
    assert.match(MIGRATION, /l\.created_at >= p_since/);
  });
  test("is idempotent, INVOKER, and executable by service_role only", () => {
    assert.match(MIGRATION, /CREATE OR REPLACE FUNCTION public\.ai_talent_spend_cents/);
    assert.match(MIGRATION, /SECURITY INVOKER/);
    assert.doesNotMatch(MIGRATION, /SECURITY DEFINER/);
    assert.match(MIGRATION, /REVOKE ALL ON FUNCTION public\.ai_talent_spend_cents\(text, timestamptz, uuid, text\) FROM PUBLIC;/);
    assert.match(MIGRATION, /FROM anon, authenticated;/);
    assert.match(MIGRATION, /GRANT EXECUTE ON FUNCTION public\.ai_talent_spend_cents\(text, timestamptz, uuid, text\) TO service_role;/);
    assert.doesNotMatch(MIGRATION, /TO (anon|authenticated|PUBLIC)/i);
  });
});
