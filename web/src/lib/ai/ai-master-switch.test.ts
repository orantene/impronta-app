import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

import { AI_OFF_MESSAGE, createDisabledChatAdapter } from "./providers/disabled-chat-adapter";
import { FLAGS_WHEN_UNREADABLE, decideAiMaster } from "../settings/ai-feature-flags";

/**
 * TUL-1622 — `ai_master_enabled` must stop EVERY AI path.
 *
 * The switch is enforced at choke points, so no caller can forget it:
 *   resolveAiChatAdapter / resolveRoutedChat / resolveFailoverChat  (every chat call)
 *   assertAiInvocationAllowed                                       (the gate before provider work)
 *   generateStockImage / generateStockAsset / generateNodeImageAction (every image call)
 * This file pins the decision, the refusal shape, the wiring, and an INVENTORY of every file that
 * reaches a provider directly, so a new direct caller fails here until it is gated.
 */

const SRC = join(__dirname, "..", "..");

function read(rel: string): string {
  return readFileSync(join(SRC, rel), "utf8");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && !name.endsWith(".d.ts")) out.push(full);
  }
  return out;
}

const MASTER_TOKEN = /isAiMasterEnabled|ai_master_enabled/;

describe("decideAiMaster", () => {
  it("is on when no row exists (the shipped default)", () => {
    assert.equal(decideAiMaster({ hasClient: true, row: null }), true);
  });
  it("follows the stored value, boolean or { enabled }", () => {
    assert.equal(decideAiMaster({ hasClient: true, row: { value: true } }), true);
    assert.equal(decideAiMaster({ hasClient: true, row: { value: false } }), false);
    assert.equal(decideAiMaster({ hasClient: true, row: { value: { enabled: false } } }), false);
    assert.equal(decideAiMaster({ hasClient: true, row: { value: { enabled: true } } }), true);
  });
  it("is OFF when the switch cannot be read: a failed query or no service client", () => {
    assert.equal(decideAiMaster({ hasClient: true, failed: true, row: null }), false);
    assert.equal(decideAiMaster({ hasClient: false }), false);
  });
});

describe("getAiFeatureFlags when it cannot read (fails closed)", () => {
  it("turns every AI toggle off, master included", () => {
    for (const [k, v] of Object.entries(FLAGS_WHEN_UNREADABLE)) {
      if (typeof v === "boolean") assert.equal(v, false, k);
    }
  });
  it("both unreadable paths return it, never the master-on defaults", () => {
    const src = read("lib/settings/ai-feature-flags.ts");
    const fn = src.slice(src.indexOf("export async function getAiFeatureFlags"), src.indexOf("let providerFromRegistry"));
    assert.equal((fn.match(/return \{ \.\.\.FLAGS_WHEN_UNREADABLE \};/g) ?? []).length, 2);
    assert.ok(!fn.includes("DEFAULT_FLAGS"));
  });
});

describe("the disabled adapter for 'off'", () => {
  it("refuses with the ai_off code and the plain message, and calls no provider", async () => {
    const adapter = createDisabledChatAdapter("off");
    const r = await adapter.chatCompletion({ systemPrompt: "s", userMessage: "u" });
    assert.equal(r.ok, false);
    if (!r.ok) {
      assert.equal(r.code, "ai_off");
      assert.equal(r.message, AI_OFF_MESSAGE);
    }
  });
});

describe("choke points check the master switch", () => {
  const wired: Array<[string, RegExp]> = [
    ["lib/ai/resolve-provider.ts", /resolveAiChatAdapter\(\)[\s\S]{0,400}isAiMasterEnabled\(\)[\s\S]{0,120}createDisabledChatAdapter\("off"\)/],
    ["lib/ai/call-routing.server.ts", /resolveRoutedChat[\s\S]{0,400}isAiMasterEnabled\(\)/],
    ["lib/ai/call-routing.server.ts", /resolveFailoverChat[\s\S]{0,300}isAiMasterEnabled\(\)/],
    ["lib/ai/ai-usage-gate.ts", /assertAiInvocationAllowed[\s\S]{0,600}isAiMasterEnabled\(\)[\s\S]{0,160}code: "ai_off"/],
    ["lib/ai/ai-image-generation.ts", /export async function generateStockImage[\s\S]{0,700}isAiMasterEnabled\(\)[\s\S]{0,160}ImageProviderError\("ai_off"/],
    ["lib/media/stock-engine.server.ts", /export async function generateStockAsset[\s\S]{0,400}isAiMasterEnabled\(\)[\s\S]{0,160}code: "ai_off"/],
    ["lib/media/stock-qa.server.ts", /async function visionChecks[\s\S]{0,900}isAiMasterEnabled\(\)/],
    ["lib/taxonomy/openai-taxonomy-promo-image.ts", /fetchOpenAiTaxonomyPromoImageBytes[\s\S]{0,300}isAiMasterEnabled\(\)/],
    ["lib/site-admin/builder-core/ai/generate-node-image-action.ts", /isAiMasterEnabled\(\)[\s\S]{0,160}code: "AI_OFF"/],
  ];
  for (const [file, re] of wired) {
    it(`${file}: ${re.source.slice(0, 48)}…`, () => {
      assert.match(read(file), re);
    });
  }

  it("the master check runs before any usage row or paid call in the node image action", () => {
    const src = read("lib/site-admin/builder-core/ai/generate-node-image-action.ts");
    const at = src.indexOf("isAiMasterEnabled()");
    assert.ok(at > 0);
    assert.ok(at < src.indexOf("await checkImageQuota(tenantId)"));
    assert.ok(at < src.indexOf("generateImageBytesFromPrompt(subject)"));
    assert.ok(at < src.indexOf("await recordImageGenerationUsage("));
  });

  it("the image job runner leaves slots queued when AI is off", () => {
    const src = read("lib/media/tenant-image-jobs.server.ts");
    assert.match(src, /r\.code === "ai_off"[\s\S]{0,260}stop = "ai_off"/);
  });
});

describe("every file that reaches a provider directly is gated or accounted for", () => {
  // Files that build a provider client or call a provider URL themselves.
  const RAW = /createAnthropicChatAdapter\(|createOpenAiChatAdapter\(|adapterForProvider\(|api\.openai\.com|new OpenAI\(|new Anthropic\(/;

  /** Raw reach that is NOT gated in the file itself, with the reason it is safe and the file that gates its callers. */
  const ACCOUNTED: Record<string, { why: string; callersGatedIn: string[] }> = {
    "lib/ai/providers/anthropic-adapter.ts": { why: "the adapter; reachable only through the resolvers above", callersGatedIn: [] },
    "lib/ai/providers/openai-adapter.ts": { why: "the adapter; reachable only through the resolvers above", callersGatedIn: [] },
    "lib/ai/openai-image-request.ts": { why: "requestOpenAiImageBytes; its only caller is the taxonomy promo image", callersGatedIn: ["lib/taxonomy/openai-taxonomy-promo-image.ts"] },
    "lib/ai/openai-embeddings.ts": { why: "search embeddings; only run when AI search is enabled", callersGatedIn: ["lib/ai/run-ai-directory-search.ts"] },
    "lib/ai/transcribe.server.ts": { why: "voice transcription; its route checks the switch", callersGatedIn: ["app/api/tulala/transcribe/route.ts"] },
  };

  const files = walk(SRC).map((f) => relative(SRC, f));
  const raw = files.filter((f) => RAW.test(read(f)));

  it("finds the known direct callers (the scan is not empty)", () => {
    assert.ok(raw.length >= 8, `expected at least 8 direct provider files, found ${raw.length}`);
  });

  for (const file of raw) {
    it(`${file}`, () => {
      const src = read(file);
      if (MASTER_TOKEN.test(src)) return;
      const entry = ACCOUNTED[file];
      assert.ok(
        entry,
        `${file} reaches an AI provider directly and does not check the AI master switch. ` +
          `Call isAiMasterEnabled() (lib/settings/ai-feature-flags) before the provider call, or go through resolveAiChatAdapter / generateStockImage.`,
      );
      for (const caller of entry.callersGatedIn) {
        assert.match(read(caller), MASTER_TOKEN, `${file} is allowed because ${caller} checks the master switch, and it no longer does`);
      }
    });
  }
});
