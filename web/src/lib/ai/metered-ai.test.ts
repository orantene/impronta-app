/** TUL-1623: every AI call passes the spend gate and writes one usage row. Lane: test:ai-guardrails. */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, test } from "node:test";
import { gateAiCall } from "./metered-ai";

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
  test("is the shared spend gate (a refusal carries the gate's code upper-cased); no database needed", () => {
    const src = read("src/lib/ai/metered-ai.ts");
    assert.match(src, /assertAiInvocationAllowed\(tenantId \|\| undefined\)/);
    assert.match(src, /code: gate\.code\.toUpperCase\(\)/);
    assert.equal(typeof gateAiCall, "function");
  });
});
