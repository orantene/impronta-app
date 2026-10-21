/** TUL-1749: one talent cannot exhaust AI for the ~300 talents who share the hub tenant's ceiling. Lane: test:ai-guardrails. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { DEFAULT_AI_TENANT_ID } from "./ai-tenant-constants";
import {
  HUB_TALENT_AI_SUBCAP,
  assertHubTalentAiAllowed,
  hubTalentRpmKey,
  sumUsageRowsSpendCents,
  utcMonthStartIso,
  type HubTalentSubcapDeps,
} from "./hub-talent-subcap";

const HUB = "11111111-1111-1111-1111-111111111111";
const AGENCY = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-10-21T12:00:00.000Z");

/** Fake store: per-talent minute counters and per-talent monthly spend, like the real limiter and usage log. */
function world(over: { spend?: Record<string, number | null>; hubTenantId?: string | null; perMinute?: Record<string, number> } = {}) {
  const calls: string[] = [];
  const minute = new Map<string, number>(Object.entries(over.perMinute ?? {}));
  const deps: HubTalentSubcapDeps = {
    now: () => NOW,
    async readHubTenantId() { calls.push("hub"); return over.hubTenantId === undefined ? HUB : over.hubTenantId; },
    async readTalentSpendCents({ tenantId, talentProfileId, monthStartIso }) {
      calls.push(`spend:${tenantId}:${talentProfileId}:${monthStartIso}`);
      return over.spend?.[talentProfileId] === undefined ? 0 : over.spend[talentProfileId];
    },
    async checkRpm(key, rpm) {
      calls.push(`rpm:${key}:${rpm}`);
      const n = (minute.get(key) ?? 0) + 1;
      minute.set(key, n);
      return n > rpm ? { ok: false, code: "rate_limited", retryAfterMs: 1000 } : { ok: true };
    },
  };
  return { deps, calls };
}

describe("a talent at their sub-cap is refused while the others still work", () => {
  test("monthly spend: the capped talent is refused with a message, another hub talent is not", async () => {
    const w = world({ spend: { heavy: HUB_TALENT_AI_SUBCAP.monthlySpendCents, light: 12 } });
    const heavy = await assertHubTalentAiAllowed({ tenantId: HUB, talentProfileId: "heavy" }, w.deps);
    assert.equal(heavy.ok, false);
    assert.ok(!heavy.ok && heavy.code === "talent_spend_cap" && /share of AI help/.test(heavy.message), "the capped talent is told why");
    assert.deepEqual(await assertHubTalentAiAllowed({ tenantId: HUB, talentProfileId: "light" }, w.deps), { ok: true });
  });

  test("just under the cap still works; the cap itself is refused", async () => {
    const under = world({ spend: { t: HUB_TALENT_AI_SUBCAP.monthlySpendCents - 1 } });
    assert.equal((await assertHubTalentAiAllowed({ tenantId: HUB, talentProfileId: "t" }, under.deps)).ok, true);
    const at = world({ spend: { t: HUB_TALENT_AI_SUBCAP.monthlySpendCents } });
    assert.equal((await assertHubTalentAiAllowed({ tenantId: HUB, talentProfileId: "t" }, at.deps)).ok, false);
  });

  test("per minute: one talent bursting past their limit is refused, a second talent is untouched", async () => {
    const w = world();
    const results: boolean[] = [];
    for (let i = 0; i < HUB_TALENT_AI_SUBCAP.requestsPerMinute + 2; i++) {
      results.push((await assertHubTalentAiAllowed({ tenantId: HUB, talentProfileId: "burst" }, w.deps)).ok);
    }
    assert.deepEqual(results.filter(Boolean).length, HUB_TALENT_AI_SUBCAP.requestsPerMinute);
    const refused = await assertHubTalentAiAllowed({ tenantId: HUB, talentProfileId: "burst" }, w.deps);
    assert.ok(!refused.ok && refused.code === "talent_rate_limit" && /minute/.test(refused.message));
    assert.equal((await assertHubTalentAiAllowed({ tenantId: HUB, talentProfileId: "calm" }, w.deps)).ok, true);
  });

  test("the minute limiter and the spend read are keyed by talent_profile_id, spend on this tenant and this UTC month", async () => {
    const w = world();
    await assertHubTalentAiAllowed({ tenantId: HUB, talentProfileId: "tp-1" }, w.deps);
    assert.ok(w.calls.includes(`rpm:${hubTalentRpmKey("tp-1")}:${HUB_TALENT_AI_SUBCAP.requestsPerMinute}`));
    assert.ok(w.calls.includes(`spend:${HUB}:tp-1:2026-10-01T00:00:00.000Z`));
  });
});

describe("hub and non-hub tenants", () => {
  test("the default AI tenant is the hub and is capped, without a hub lookup", async () => {
    const w = world({ spend: { t: 99_999 } });
    const r = await assertHubTalentAiAllowed({ tenantId: DEFAULT_AI_TENANT_ID, talentProfileId: "t" }, w.deps);
    assert.equal(r.ok, false);
    assert.ok(!w.calls.includes("hub"));
  });

  test("no tenant id is the default AI tenant (what the gateway assumes) and is capped", async () => {
    const w = world({ spend: { t: 99_999 } });
    assert.equal((await assertHubTalentAiAllowed({ tenantId: null, talentProfileId: "t" }, w.deps)).ok, false);
  });

  test("a non-hub workspace is never sub-capped and nothing is read or counted for it", async () => {
    const w = world({ spend: { t: 99_999 } });
    assert.deepEqual(await assertHubTalentAiAllowed({ tenantId: AGENCY, talentProfileId: "t" }, w.deps), { ok: true });
    assert.deepEqual(w.calls, ["hub"], "only the hub lookup, no limiter token, no spend read");
  });

  test("no platform hub row: a non-default tenant is treated as non-hub", async () => {
    const w = world({ hubTenantId: null, spend: { t: 99_999 } });
    assert.equal((await assertHubTalentAiAllowed({ tenantId: AGENCY, talentProfileId: "t" }, w.deps)).ok, true);
  });

  test("the platform hub workspace is capped like the default tenant", async () => {
    const w = world({ spend: { t: 99_999 } });
    assert.equal((await assertHubTalentAiAllowed({ tenantId: HUB, talentProfileId: "t" }, w.deps)).ok, false);
  });

  test("a call with no talent id has nothing to key on: allowed, nothing read", async () => {
    const w = world();
    assert.deepEqual(await assertHubTalentAiAllowed({ tenantId: HUB, talentProfileId: null }, w.deps), { ok: true });
    assert.deepEqual(w.calls, []);
  });
});

describe("failure handling", () => {
  test("a spend read that fails refuses (never waves the call through)", async () => {
    const r = await assertHubTalentAiAllowed({ tenantId: HUB, talentProfileId: "t" }, world({ spend: { t: null } }).deps);
    assert.ok(!r.ok && r.code === "unavailable");
  });
});

describe("pure helpers", () => {
  test("UTC month start", () => {
    assert.equal(utcMonthStartIso(new Date("2026-12-31T23:59:59.000Z")), "2026-12-01T00:00:00.000Z");
  });
  test("spend sums paid rows, each at least one cent", () => {
    assert.equal(sumUsageRowsSpendCents([{ context_jsonb: { cost_usd: 0.004 } }, { context_jsonb: { cost_usd: 0.5 } }, { context_jsonb: {} }, { context_jsonb: null }]), 51);
  });
  test("the talent share is a small slice of the tenant ceiling (300/min, $200)", () => {
    assert.ok(HUB_TALENT_AI_SUBCAP.requestsPerMinute * 50 <= 300);
    assert.ok(HUB_TALENT_AI_SUBCAP.monthlySpendCents <= 20_000 * 0.05);
  });
});

describe("wiring: the talent-facing actions ask first, then the unchanged tenant gate", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  test("translate: the share check runs before assertAiInvocationAllowed and maps to rate_limit / quota", () => {
    const s = read("src/lib/server-actions/translate-talent-field.ts");
    assert.ok(s.indexOf("assertHubTalentAiAllowed({ tenantId, talentProfileId: self.id })") > 0);
    assert.ok(s.indexOf("assertHubTalentAiAllowed(") < s.indexOf("assertAiInvocationAllowed(tenantId)"));
    assert.match(s, /share\.code === "talent_rate_limit" \? "rate_limit" : "quota"/);
  });
  test("bio helper: the share check runs first and returns personal_cap with its message", () => {
    const s = read("src/lib/server-actions/ai-writing-helper.ts");
    assert.ok(s.indexOf("assertHubTalentAiAllowed(") > 0 && s.indexOf("assertHubTalentAiAllowed(") < s.indexOf("assertAiInvocationAllowed("));
    assert.match(s, /code: "personal_cap", message: share\.message/);
  });
  test("the gateway files are untouched by this change", () => {
    assert.ok(!/hub-talent-subcap/.test(read("src/lib/ai/ai-usage-gate.ts")));
    assert.ok(!/hub-talent-subcap/.test(read("src/lib/ai/metered-ai.ts")));
  });
  test("the capped talent sees a message in EN and ES", () => {
    const card = read("src/components/talent/bio-helper-card.tsx");
    assert.match(card, /personal_cap[\s\S]{0,80}personalCapReached/);
    for (const l of ["en", "es"]) {
      const j = JSON.parse(read(`messages/${l}.json`)) as { dashboard: { talent: { bioHelper: Record<string, string> } } };
      assert.ok(j.dashboard.talent.bioHelper.personalCapReached.length > 20, l);
    }
  });
});
