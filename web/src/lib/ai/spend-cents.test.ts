/** TUL-1731: the spend counter sees the REAL cost of a call, not a flat cent. Lane: test:ai-guardrails. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { estimateCostUsd } from "./ai-model-costs";
import { AiSpendCollector, chatSpendUsd, recordMeasuredAiSpend, transcriptionSpendUsd, usdToSpendCents } from "./spend-cents";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("usdToSpendCents: unbiased rounding of fractions of a cent", () => {
  test("zero, negative and non-finite cost is 0; whole cents are always counted", () => {
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.equal(usdToSpendCents(bad), 0);
    assert.equal(usdToSpendCents(0.05, () => 0.99), 5, "5.0 cents exactly: no extra cent");
    assert.equal(usdToSpendCents(0.0537, () => 0.99), 5);
    assert.equal(usdToSpendCents(0.0537, () => 0.1), 6, "5.37 cents: the extra cent when the draw is under .37");
  });
  test("a sub-cent call counts the true fraction on average, not 1 cent each (the old 1 cent floor over-counted a 0.05 cent call 20x)", () => {
    // mulberry32: a small, well-distributed seeded generator, so the test is deterministic
    let a = 0x9e3779b9;
    const rng = () => {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const usdPerCall = 0.0005; // 0.05 cents
    let cents = 0;
    const calls = 100_000;
    for (let i = 0; i < calls; i++) cents += usdToSpendCents(usdPerCall, rng);
    const trueCents = calls * usdPerCall * 100;
    assert.ok(Math.abs(cents - trueCents) / trueCents < 0.05, `counted ${cents} vs true ${trueCents}`);
    assert.ok(cents < calls / 10, "nowhere near 1 cent per call");
  });
});

describe("pricing by the model that served the call", () => {
  test("an embedding is priced by input tokens at the embedding rate", () => {
    assert.equal(estimateCostUsd("text-embedding-3-small", 1_000_000, 0), 0.02);
    assert.equal(chatSpendUsd("text-embedding-3-small", { inputTokens: 20 }), (20 / 1_000_000) * 0.02);
  });
  test("chat: a Haiku 5.5 call is priced at Haiku rates; an unknown model uses the conservative fallback; unknown usage is 0", () => {
    assert.equal(chatSpendUsd("claude-haiku-5-5", { inputTokens: 1_000_000, outputTokens: 1_000_000 }), 0.6);
    assert.equal(chatSpendUsd(null, { inputTokens: 1_000_000, outputTokens: 1_000_000 }), 18);
    assert.equal(chatSpendUsd("claude-haiku-5-5", undefined), 0);
  });
  test("transcription is priced per minute of audio, estimated from the upload size, never free", () => {
    const oneMinuteBytes = 60 * 3_000;
    assert.equal(transcriptionSpendUsd("gpt-4o-mini-transcribe", oneMinuteBytes), 0.003);
    assert.equal(transcriptionSpendUsd("whisper-1", oneMinuteBytes), 0.006);
    assert.ok(transcriptionSpendUsd("gpt-4o-mini-transcribe", 0) > 0);
    assert.ok(transcriptionSpendUsd("gpt-4o-mini-transcribe", 10 * oneMinuteBytes) > transcriptionSpendUsd("gpt-4o-mini-transcribe", oneMinuteBytes));
  });
  test("the collector adds several calls of one request (extraction + reply)", () => {
    const c = new AiSpendCollector();
    c.add("claude-haiku-5-5", { inputTokens: 1_000_000, outputTokens: 0 });
    c.add("claude-haiku-5-5", { inputTokens: 0, outputTokens: 1_000_000 });
    assert.equal(c.total(), 0.1 + 0.5);
    assert.equal(c.count(), 2);
  });
});

describe("recordMeasuredAiSpend", () => {
  test("records the rounded real cost against the tenant; an unknown cost falls back; an explicit 0 fallback records 0", async () => {
    const seen: Array<[string, number]> = [];
    const rec = async (t: string, c: number) => { seen.push([t, c]); };
    await recordMeasuredAiSpend("w1", 0.07, 1, rec);
    await recordMeasuredAiSpend("w1", 0, 1, rec);
    await recordMeasuredAiSpend("w1", 0, 0, rec);
    assert.deepEqual(seen, [["w1", 7], ["w1", 1], ["w1", 0]]);
  });
  test("never throws", async () => {
    await recordMeasuredAiSpend("w1", 0.01, 1, async () => { throw new Error("db down"); });
  });
});

describe("the flat estimates are gone from the priced sites", () => {
  const priced: Array<[string, RegExp]> = [
    ["src/app/api/ai/interpret-search/route.ts", /chatSpendUsd\(modelRun\.model, modelRun\.usage\)/],
    ["src/app/api/ai/inquiry-draft/route.ts", /chatSpendUsd\(u\.model, u\.usage\)/],
    ["src/app/api/tulala/transcribe/route.ts", /transcriptionSpendUsd\(TRANSCRIBE_MODEL, audio\.size\)/],
    ["src/lib/tulala/strategist.server.ts", /spend\.add\(completion\.model, completion\.usage\)[\s\S]*spend\.add\(completion\.model, completion\.usage\)/],
    ["src/lib/tulala/turn.server.ts", /spend\.add\(outcome\.model, outcome\.usage\)[\s\S]*spend\.add\(event\.model, event\.usage\)/],
    ["src/lib/tulala/url-import.server.ts", /chatSpendUsd\(completion\.model, completion\.usage\)/],
    ["src/lib/media/stock-qa.server.ts", /chatSpendUsd\(model, \{ inputTokens: json\.usage\?\.prompt_tokens/],
    ["src/lib/ai/run-ai-directory-search.ts", /chatSpendUsd\(OPENAI_EMBEDDING_MODEL_ID, \{ inputTokens \}\)/],
  ];
  for (const [file, rx] of priced) {
    test(file, () => {
      const s = strip(read(file));
      assert.match(s, rx);
      assert.match(s, /recordMeasuredAiSpend\(/);
      assert.doesNotMatch(s, /recordAiUsageEstimate\(/, "no flat 1 cent left on this path");
    });
  }
  test("embeddings: the callback fires only for a real request (not a cache hit or a deduped waiter)", () => {
    const s = strip(read("src/lib/ai/openai-embeddings.ts"));
    assert.match(s, /embedTextForSearchUncached\(text, onTokens\)/);
    assert.match(s, /if \(typeof billedTokens === "number"\) onTokens\?\.\(billedTokens\)/);
    const hit = s.indexOf("const hit = cacheGet(key);");
    assert.ok(hit > 0 && s.indexOf("return hit;") > hit && s.indexOf("return hit;") < s.indexOf("embedTextForSearchUncached(text, onTokens)"));
  });
  test("node image: the measured image cost reaches the spend counter (flat 8 cents only when the reply carries no usage)", () => {
    const gen = strip(read("src/lib/ai/ai-image-generation.ts"));
    assert.match(gen, /onMeasuredCostUsd\?\.\(out\.costUsd\)/);
    assert.match(gen, /input\.measuredCostUsd && input\.measuredCostUsd > 0 \? input\.measuredCostUsd : estimateImageCostUsd\(\)/);
    const act = strip(read("src/lib/site-admin/builder-core/ai/generate-node-image-action.ts"));
    assert.match(act, /recordImageGenerationUsage\(\{ tenantId, userId: auth\.user\.id, ok: true, measuredCostUsd \}\)/);
  });
});
