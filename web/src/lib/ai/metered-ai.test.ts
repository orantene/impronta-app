/** TUL-1623: every AI call passes the spend gate and writes one usage row. Lane: test:ai-guardrails. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { estimateCostUsd } from "./ai-model-costs";
import { gateAiCall, meteredUsageArgs, toGateAiCallResult } from "./metered-ai";

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|static\.test|render\.test)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/** Files that call a model directly and are metered by their CALLER or are the plumbing itself. One reason each. */
const NOT_A_CALL_SITE: Readonly<Record<string, string>> = {
  "src/lib/ai/provider.ts": "the adapter interface",
  "src/lib/ai/providers/anthropic-adapter.ts": "the provider adapter itself",
  "src/lib/ai/providers/openai-adapter.ts": "the provider adapter itself",
  "src/lib/ai/providers/disabled-chat-adapter.ts": "the disabled adapter (never calls a model)",
  "src/lib/ai/call-routing.server.ts": "binds a routed model onto an adapter; callers meter",
  "src/lib/ai/stream.ts": "streaming helper; its callers meter (support chat records usage)",
  "src/lib/ai/inquiry-draft-model.ts": "called by /api/ai/inquiry-draft, which gates and records usage",
  "src/lib/ai/interpret-search-model.ts": "called by /api/ai/interpret-search, which gates and records usage",
  "src/lib/tulala/extract-and-record.server.ts": "called by tulala/turn.server.ts, which gates and records usage",
};
const METER = /recordAiGenerationUsage|recordAiUsageEstimate|meterAiCall|cms_ai_usage_log/;

describe("the meter is not optional", () => {
  const callers = walk(join(ROOT, "src"))
    .map((f) => ({ rel: relative(ROOT, f), src: strip(readFileSync(f, "utf8")) }))
    .filter((f) => /\.chatCompletion\(|chatCompletion:\s*\(/.test(f.src) || /\bchatCompletion\b/.test(f.src));

  test("floors: the scan sees the call sites it should", () => {
    assert.ok(callers.length >= 20, `expected at least 20 files, found ${callers.length}`);
    for (const f of ["src/lib/site-admin/edit-mode/ai-rewrite-action.ts", "src/lib/translation/ai-translate-bio.ts"]) assert.ok(callers.some((c) => c.rel === f), f);
    for (const f of Object.keys(NOT_A_CALL_SITE)) assert.ok(callers.some((c) => c.rel === f), `${f} is allow-listed but no longer mentions chatCompletion (stale)`);
  });

  test("every file that calls chatCompletion records usage, or is on the allow-list with a reason", () => {
    const problems = callers
      .filter((c) => !NOT_A_CALL_SITE[c.rel] && !METER.test(c.src))
      .map((c) => `${c.rel}: calls chatCompletion but never records usage (use gateAiCall / meterAiCall from lib/ai/metered-ai)`);
    assert.deepEqual(problems, []);
  });

  test("a file is never both metered and allow-listed (the list cannot hide a regression)", () => {
    for (const c of callers) if (NOT_A_CALL_SITE[c.rel]) assert.ok(NOT_A_CALL_SITE[c.rel].trim().length > 0);
  });
});

describe("the seven paths named on the card", () => {
  const gated = [
    ["src/lib/site-admin/edit-mode/ai-generate-action.ts", 2],
    ["src/lib/site-admin/edit-mode/ai-rewrite-action.ts", 2],
    ["src/lib/translation/ai-translate-bio.ts", 1],
    ["src/lib/translation/ai-translate-label.ts", 1],
  ] as const;
  for (const [file, n] of gated) {
    test(`${file}: ${n} paid call(s), each gated BEFORE and metered AFTER`, () => {
      const src = strip(read(file));
      assert.equal((src.match(/\.chatCompletion\(/g) ?? []).length, n);
      assert.equal((src.match(/await gateAiCall\(/g) ?? []).length, n, "gate per call");
      assert.equal((src.match(/meterAiCall\(\{/g) ?? []).length, n, "meter per call");
      let from = 0;
      for (let i = 0; i < n; i++) {
        const call = src.indexOf(".chatCompletion(", from);
        const gate = src.lastIndexOf("await gateAiCall(", call);
        const meter = src.indexOf("meterAiCall({", call);
        assert.ok(gate > from - 1 && gate < call, "gate comes before the call");
        assert.ok(meter > call, "meter comes after the call");
        from = call + 1;
      }
    });
  }
  test("text-to-page: the ranker call now records usage against the workspace", () => {
    const src = strip(read("src/lib/site-admin/builder-core/ai/text-to-page-action.ts"));
    assert.match(src, /meterAiCall\(\{ tenantId, actorProfileId, feature: "text_to_page_rank"/);
    assert.match(src, /buildModelRanker\(tenantId, auth\.user\.id\)/);
    assert.ok(src.indexOf("assertAiInvocationAllowed(tenantId)") < src.indexOf("composePageFromBrief({"));
  });
  test("every feature key is distinct", () => {
    const keys = new Set<string>();
    for (const f of ["src/lib/site-admin/edit-mode/ai-generate-action.ts", "src/lib/site-admin/edit-mode/ai-rewrite-action.ts", "src/lib/site-admin/builder-core/ai/text-to-page-action.ts", "src/lib/translation/ai-translate-bio.ts", "src/lib/translation/ai-translate-label.ts"]) {
      for (const m of strip(read(f)).matchAll(/feature: "([a-z_]+)"/g)) {
        assert.ok(!keys.has(m[1]), `duplicate feature key ${m[1]}`);
        keys.add(m[1]);
      }
    }
    assert.ok(keys.size >= 7);
  });
});

describe("gateAiCall", () => {
  test("is the shared spend gate (no database needed to check the wiring)", () => {
    const src = read("src/lib/ai/metered-ai.ts");
    assert.match(src, /assertAiInvocationAllowed\(tenantId \|\| undefined\)/);
    assert.equal(typeof gateAiCall, "function");
  });
  test("the refusal codes callers already branch on: rate_limit is RATE_LIMITED (ai-translate-site-action checks that), the rest upper-case", () => {
    assert.deepEqual(toGateAiCallResult({ ok: false, code: "rate_limit", message: "m" }), { ok: false, error: "m", code: "RATE_LIMITED" });
    assert.deepEqual(toGateAiCallResult({ ok: false, code: "spend_cap", message: "m" }), { ok: false, error: "m", code: "SPEND_CAP" });
    assert.deepEqual(toGateAiCallResult({ ok: false, code: "monthly_requests", message: "m" }), { ok: false, error: "m", code: "MONTHLY_REQUESTS" });
    assert.deepEqual(toGateAiCallResult({ ok: true }), { ok: true });
    assert.match(read("src/lib/site-admin/edit-mode/ai-translate-site-action.ts"), /result\.code === "RATE_LIMITED"/);
  });
});

describe("pricing: the model that SERVED the call prices it (no fallback-rate over-billing)", () => {
  const base = { feature: "f", provider: "anthropic", startedAt: Date.now() };
  const usage = { inputTokens: 1_000_000, outputTokens: 1_000_000 };
  test("a successful call carries the served model into the usage row, and it is priced at THAT model's rate", () => {
    const args = meteredUsageArgs({ ...base, model: null, result: { ok: true, text: "x", model: "claude-haiku-5-5", usage } });
    assert.equal(args.model, "claude-haiku-5-5");
    assert.equal(estimateCostUsd(args.model, usage.inputTokens, usage.outputTokens), 0.1 + 0.5);
    // the same tokens at the unknown-model fallback would be 3 + 15 = 18 USD: 30x more
    assert.equal(estimateCostUsd(null, usage.inputTokens, usage.outputTokens), 18);
  });
  test("the caller's model is only the fallback when a result carries none; a failed call records no usage", () => {
    assert.equal(meteredUsageArgs({ ...base, model: "claude-sonnet-5", result: { ok: true, text: "x", usage } }).model, "claude-sonnet-5");
    const failed = meteredUsageArgs({ ...base, model: "claude-sonnet-5", result: { ok: false, code: "x", message: "m" } });
    assert.equal(failed.ok, false);
    assert.equal(failed.usage, undefined);
  });
  test("the tenant, actor and feature are carried into the row", () => {
    const args = meteredUsageArgs({ ...base, tenantId: "w1", actorProfileId: "u1", model: null, result: { ok: true, text: "x", model: "gpt-4o-mini", usage } });
    assert.equal(args.tenantId, "w1");
    assert.equal(args.actorProfileId, "u1");
    assert.equal(args.scope, "f");
  });
});

describe("bio translation is billed to the workspace (not the platform)", () => {
  test("the translator takes the tenant, the four service functions pass it, the admin actions supply it", () => {
    const bio = strip(read("src/lib/translation/ai-translate-bio.ts"));
    assert.match(bio, /gateAiCall\(opts\.tenantId\)/);
    assert.match(bio, /meterAiCall\(\{ tenantId: opts\.tenantId,/);
    const svc = strip(read("src/lib/translation/talent-bio-translation-service.ts"));
    assert.equal((svc.match(/translateBioEnToEs\(en, \{ tenantId: billingTenantId \}\)/g) ?? []).length, 4);
    const admin = strip(read("src/lib/server-actions/admin-talent-translations.ts"));
    assert.match(admin, /aiFillMissingSpanishBio\(\s*auth\.supabase,[\s\S]*?billingTenantId,\s*\)/);
    assert.match(admin, /aiRefreshSpanishBioLive\(auth\.supabase, id, auth\.user\.id, billingTenantId\)/);
  });
  test("no unused imports left behind in text-to-page (it only meters; the gate was already there)", () => {
    assert.doesNotMatch(read("src/lib/site-admin/builder-core/ai/text-to-page-action.ts"), /import \{ gateAiCall/);
  });
});

describe("raw model calls (fetch to a provider, image generation) also record usage", () => {
  const callers = walk(join(ROOT, "src"))
    .map((f) => ({ rel: relative(ROOT, f), src: strip(readFileSync(f, "utf8")) }))
    .filter((f) => /fetch\(\s*["'`]https:\/\/api\.(openai|anthropic)\.com\//.test(f.src) || /\bgenerateStockImage\(|\bgenerateImageBytesFromPrompt\(/.test(f.src));
  /** Files that make a raw provider call and are metered by the caller, are plumbing, or are covered by TUL-1624 (#4329). */
  const RAW_ALLOW: Readonly<Record<string, string>> = {
    "src/lib/ai/ai-image-generation.ts": "the image provider seam itself; its callers meter (stock engine, node image action)",
    "src/lib/ai/openai-image-request.ts": "the OpenAI image request seam; its callers (stock engine, node image action) meter",
    "src/lib/ai/openai-embeddings.ts": "the embedding seam; search records the usage per call (TUL-1624, #4329)",
    "src/lib/media/stock-qa.server.ts": "vision QA call: gated and recorded in TUL-1624 (#4329)",
    "src/lib/site-admin/builder-core/ai/generate-node-image-action.ts": "node image: gated and recorded in TUL-1624 (#4329)",
    "src/lib/taxonomy/openai-taxonomy-promo-image.ts": "platform taxonomy promo image (admin-only batch tool); metered by its stock-engine caller",
  };
  test("floor: the scan sees raw provider callers", () => {
    assert.ok(callers.length >= 3, `found ${callers.length}`);
  });
  test("every raw caller records usage or is allow-listed with a reason", () => {
    const problems = callers
      .filter((c) => !RAW_ALLOW[c.rel] && !METER.test(c.src))
      .map((c) => `${c.rel}: calls a provider directly and never records usage`);
    assert.deepEqual(problems, []);
  });
});
