/** TUL-1624 P1: no AI path bypasses the workspace ceiling, and public AI is billed to the workspace it ran for. Lane: test:ai-guardrails. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { aiBillingTenantFromHost } from "./ai-billing-tenant";
import { DEFAULT_AI_TENANT_ID } from "./ai-tenant-constants";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("which workspace a public AI call is billed to", () => {
  test("a request on a workspace host is billed to that workspace", () => {
    assert.equal(aiBillingTenantFromHost({ kind: "agency", tenantId: "w-1" }), "w-1");
  });
  test("platform traffic (marketing, app, unknown host, no context) stays on the platform tenant", () => {
    for (const ctx of [{ kind: "marketing" }, { kind: "app" }, { kind: "unknown" }, { kind: "agency", tenantId: null }, null, undefined]) {
      assert.equal(aiBillingTenantFromHost(ctx as never), DEFAULT_AI_TENANT_ID);
    }
  });
});

describe("the public AI sites gate AND record against the same resolved tenant", () => {
  const sites: Array<[string, RegExp, RegExp]> = [
    ["src/app/api/tulala/transcribe/route.ts", /resolveAiBillingTenantId\(\)[\s\S]*assertAiInvocationAllowed\(aiTenantId\)/, /recordAiUsageEstimate\(aiTenantId\)/],
    ["src/app/api/ai/inquiry-draft/route.ts", /resolveAiBillingTenantId\(\)[\s\S]*assertAiInvocationAllowed\(aiTenantId\)/, /recordAiUsageEstimate\(aiTenantId\)/],
    ["src/app/api/ai/interpret-search/route.ts", /aiTenantId = tenantId \?\? DEFAULT_AI_TENANT_ID[\s\S]*assertAiInvocationAllowed\(aiTenantId\)/, /recordAiUsageEstimate\(aiTenantId\)/],
    ["src/lib/tulala/strategist.server.ts", /resolveAiBillingTenantId\(\)[\s\S]*assertAiInvocationAllowed\(aiTenantId\)/, /recordAiUsageEstimate\(aiTenantId\)/],
    ["src/lib/tulala/turn.server.ts", /resolveAiBillingTenantId\(\)[\s\S]*assertAiInvocationAllowed\(aiTenantId\)/, /recordAiUsageEstimate\(aiTenantId\)/],
    ["src/lib/tulala/url-import.server.ts", /resolveAiBillingTenantId\(\)[\s\S]*assertAiInvocationAllowed\(aiTenantId\)[\s\S]*extractFromPage\(page, input\.brief, input\.locale, aiTenantId\)/, /recordAiUsageEstimate\(aiTenantId\)/],
  ];
  for (const [file, gate, rec] of sites) {
    test(file, () => {
      const src = strip(read(file));
      assert.match(src, gate);
      assert.match(src, rec);
      assert.doesNotMatch(src, /assertAiInvocationAllowed\(\)/, "no gate on the platform default");
      assert.doesNotMatch(src, /recordAiUsageEstimate\(\)/, "no record on the platform default");
    });
  }
  test("only true platform paths still use the default tenant (onboarding with no workspace; fallbacks that have no tenant)", () => {
    for (const f of ["src/lib/onboarding/understand.server.ts"]) assert.match(strip(read(f)), /assertAiInvocationAllowed\(\)/);
  });
});

describe("the bypass sites close", () => {
  test("generate-node-image: the workspace ceiling BEFORE the paid call, the cost recorded AFTER", () => {
    const s = strip(read("src/lib/site-admin/builder-core/ai/generate-node-image-action.ts"));
    assert.ok(s.indexOf("gateAiCall(tenantId)") > 0 && s.indexOf("gateAiCall(tenantId)") < s.indexOf("generateImageBytesFromPrompt(subject)"));
    assert.ok(s.indexOf("recordAiUsageEstimate(tenantId, IMAGE_ESTIMATE_CENTS)") > s.indexOf("recordImageGenerationUsage({ tenantId, userId: auth.user.id, ok: true })"));
  });
  test("stock engine (platform pool and per-site tenant images): gated before the paid call, for the tenant it bills", () => {
    const s = strip(read("src/lib/media/stock-engine.server.ts"));
    const gate = s.indexOf("assertAiInvocationAllowed(gateTenantId)");
    assert.ok(gate > 0 && gate < s.indexOf("generateStockImage({"));
    assert.match(s, /input\.originTenantId \?\? \(await resolveStockTenantId\(admin\)\)/);
  });
  test("stock QA vision: gated before the call, recorded after, against the tenant it is for (platform by default)", () => {
    const s = strip(read("src/lib/media/stock-qa.server.ts"));
    const gate = s.indexOf("assertAiInvocationAllowed(aiTenantId)");
    assert.ok(gate > 0 && gate < s.indexOf('fetch("https://api.openai.com/v1/chat/completions"'));
    assert.ok(s.indexOf("recordAiUsageEstimate(aiTenantId)") > s.indexOf('fetch("https://api.openai.com/v1/chat/completions"'));
    assert.match(s, /input\.tenantId \|\| DEFAULT_AI_TENANT_ID/);
  });
  test("search embeddings: the paid embedding is recorded against the workspace (recorded, not gated: search must not break)", () => {
    const s = strip(read("src/lib/ai/run-ai-directory-search.ts"));
    assert.match(s, /afterResponse\(\(\) => recordAiUsageEstimate\(tenantScopeId \?\? DEFAULT_AI_TENANT_ID\)/);
    assert.ok(s.indexOf("recordAiUsageEstimate(tenantScopeId") > s.indexOf("embedTextForSearch(normalizedForEmbedding!)"));
  });
});

describe("the platform row", () => {
  test("raised to 300/min and 50,000/month, never lowered, spend cap untouched (migration 423800, held)", () => {
    const sql = read("../supabase/migrations/_pending_pm/20261231423800_ai_platform_controls_tul1624.sql").replace(/^\s*--.*$/gm, "");
    assert.match(sql, /max_requests_per_minute = GREATEST\(COALESCE\(max_requests_per_minute, 0\), 300\)/);
    assert.match(sql, /max_requests_per_month = GREATEST\(COALESCE\(max_requests_per_month, 0\), 50000\)/);
    assert.match(sql, /WHERE tenant_id = '00000000-0000-0000-0000-000000000001'/);
    assert.doesNotMatch(sql, /monthly_spend_cap_cents/);
  });
});
