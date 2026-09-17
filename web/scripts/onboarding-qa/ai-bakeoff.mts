/**
 * AI routing bake-off for the onboarding signup (Phase 9).
 *
 * Runs the two model-backed calls of a signup (fact extraction, site copy
 * pass) over the onboarding fixtures on every candidate model, and prints
 * cost, latency and a quality score per call type, so the routing choice
 * (which model for which call) is a measured decision.
 *
 * Touches no database and no tenant: prompts are built from the fixtures in
 * memory and the model replies are scored in memory. Spend: cents.
 *
 *   node --env-file=.env.local --import tsx scripts/onboarding-qa/ai-bakeoff.mts [--models a,b] [--runs 2]
 */

import { createAnthropicChatAdapter } from "@/lib/ai/providers/anthropic-adapter";
import { createOpenAiChatAdapter } from "@/lib/ai/providers/openai-adapter";
import type { AiProviderAdapter } from "@/lib/ai/provider";
import { estimateCostUsd, rateForModel } from "@/lib/ai/ai-model-costs";
import { EXTRACTION_SCHEMA, parseExtraction } from "@/lib/tulala/extraction";
import { buildExtractionMessage, buildExtractionPrompt } from "@/lib/tulala/prompts";
import { ONBOARDING_FIXTURES } from "@/lib/onboarding/fixtures";
import {
  buildCopyPassPrompt,
  COPY_PASS_JSON_SCHEMA,
  COPY_PASS_KEYS,
  COPY_PASS_MAX_TOKENS,
  screenCopyReply,
  type CopyPassFacts,
} from "@/lib/site-admin/builder-core/site-templates/copy-pass";
import { LOOK_COPY_DEFAULTS } from "@/lib/site-admin/builder-core/site-templates/copy";
import { normalizeHeadline } from "@/lib/site-admin/builder-core/site-templates/copy-critic";

type Candidate = { provider: "anthropic" | "openai"; model: string };

const DEFAULT_CANDIDATES: Candidate[] = [
  { provider: "anthropic", model: "claude-sonnet-5" },
  { provider: "anthropic", model: "claude-haiku-4-5-20251001" },
  { provider: "openai", model: "gpt-4.1" },
  { provider: "openai", model: "gpt-4.1-mini" },
  { provider: "openai", model: "gpt-4o-mini" },
];

const args = process.argv.slice(2);
const argValue = (flag: string): string | null => {
  const i = args.indexOf(flag);
  return i >= 0 ? (args[i + 1] ?? null) : null;
};
const RUNS = Number(argValue("--runs") ?? "1");
const ONLY = argValue("--only"); // extraction | copy
const candidates: Candidate[] = (argValue("--models")?.split(",") ?? []).length
  ? argValue("--models")!.split(",").map((m) => ({ provider: m.startsWith("claude") ? "anthropic" : "openai", model: m.trim() }))
  : DEFAULT_CANDIDATES;

function adapterFor(c: Candidate): AiProviderAdapter {
  return c.provider === "anthropic"
    ? createAnthropicChatAdapter(process.env.ANTHROPIC_API_KEY ?? null)
    : createOpenAiChatAdapter(process.env.OPENAI_API_KEY ?? null);
}

// ─── Extraction cases ────────────────────────────────────────────────────────

type ExtractionCase = { id: string; locale: "en" | "es"; text: string; expected: Array<[string, unknown]> };

const EXTRACTION_CASES: ExtractionCase[] = [];
for (const f of ONBOARDING_FIXTURES) {
  if (f.link) continue; // El Paisa's facts come from the URL import, not the model
  for (const locale of ["en", "es"] as const) {
    EXTRACTION_CASES.push({
      id: `${f.id}/${locale}`,
      locale,
      text: f.sentence[locale],
      expected: f.facts.map(([key, value]) => [key, value] as [string, unknown]),
    });
  }
}
// A business said as a sentence (no link), the hardest realistic case: hours,
// a phone without a country code, dishes, city, in Spanish.
EXTRACTION_CASES.push({
  id: "parrilla/es",
  locale: "es",
  text: "Tenemos una parrilla argentina en Cancún, abrimos de martes a domingo de 1 a 11 de la noche, el WhatsApp es 998 123 4567, hacemos bife de chorizo y empanadas de carne.",
  expected: [
    ["business.name", null],
    ["work.industry", "Argentine grill"],
    ["person.city", "Cancún"],
    ["business.hours", ["Tue-Sun"]],
    ["presence.whatsapp", "998"],
    ["work.services", ["Bife de chorizo", "Empanadas"]],
  ],
});

function norm(v: unknown): string {
  return JSON.stringify(v).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Loose match: the produced value contains the expected value's words, or vice-versa. */
function valueMatches(expected: unknown, produced: unknown): boolean {
  if (expected === null) return produced != null; // "some value" is enough
  const e = norm(expected);
  const p = norm(produced);
  if (e === p) return true;
  const words = (Array.isArray(expected) ? expected.map(String) : [String(expected)])
    .flatMap((s) => s.toLowerCase().split(/[^a-z0-9áéíóúñ]+/i))
    .filter((w) => w.length > 2);
  const hits = words.filter((w) => p.includes(norm(w).replace(/"/g, "")));
  return words.length > 0 && hits.length / words.length >= 0.5;
}

async function runExtraction(c: Candidate, adapter: AiProviderAdapter, cs: ExtractionCase) {
  const t0 = Date.now();
  const res = await adapter.chatCompletion({
    systemPrompt: buildExtractionPrompt({ pack: null }),
    userMessage: buildExtractionMessage({ userMessage: cs.text, brief: null, question: null }),
    jsonSchema: EXTRACTION_SCHEMA,
    maxTokens: 1200,
    temperature: 0,
    model: c.model,
  });
  const ms = Date.now() - t0;
  if (!res.ok) return { ok: false as const, ms, error: `${res.code}: ${res.message}` };
  const parsed = parseExtraction(res.text);
  const produced = new Map(parsed.facts.map((f) => [f.factKey, f.value] as const));
  const expectedKeys = cs.expected.map(([k]) => k);
  const found = cs.expected.filter(([k, v]) => produced.has(k) && valueMatches(v, produced.get(k)));
  const wrong = cs.expected.filter(([k, v]) => produced.has(k) && !valueMatches(v, produced.get(k)));
  const extra = [...produced.keys()].filter((k) => !expectedKeys.includes(k));
  const cost = estimateCostUsd(res.model ?? c.model, res.usage?.inputTokens, res.usage?.outputTokens);
  return {
    ok: true as const,
    ms,
    cost,
    tokens: `${res.usage?.inputTokens ?? "?"}/${res.usage?.outputTokens ?? "?"}`,
    recall: found.length / cs.expected.length,
    wrong: wrong.map(([k, v]) => `${k}: expected ${norm(v)} got ${norm(produced.get(k))}`),
    extra,
    parseFailed: parsed.parseFailed,
    rejected: parsed.rejected.length,
  };
}

// ─── Copy-pass cases ─────────────────────────────────────────────────────────

type CopyCase = { id: string; locale: "en" | "es"; facts: CopyPassFacts };

const COPY_CASES: CopyCase[] = [
  {
    id: "rosa/es",
    locale: "es",
    facts: {
      businessName: "Rosa Limpieza",
      city: "Playa del Carmen",
      tagline: null,
      familyLabel: "services",
      typeLabel: { es: "Limpieza de casas", en: "House cleaning" },
      audience: null,
      tone: null,
      differentiator: null,
      description: null,
      services: ["Limpieza de casas", "Limpieza profunda"],
    },
  },
  {
    id: "mariana/en",
    locale: "en",
    facts: {
      businessName: "Uñas Mariana",
      city: "Tulum",
      tagline: null,
      familyLabel: "beauty",
      typeLabel: { es: "Salón de uñas", en: "Nail salon" },
      audience: "women",
      tone: "fun",
      differentiator: "also at home",
      description: null,
      services: ["Manicure", "Gel nails", "Pedicure"],
    },
  },
  {
    id: "el-paisa/es",
    locale: "es",
    facts: {
      businessName: "Parrilla El Paisa",
      city: "Cancún",
      tagline: null,
      familyLabel: "food",
      typeLabel: { es: "Parrilla argentina", en: "Argentine grill" },
      audience: null,
      tone: null,
      differentiator: null,
      description: null,
      services: ["Parrilla", "Empanadas", "Postres"],
    },
  },
];

async function runCopy(c: Candidate, adapter: AiProviderAdapter, cs: CopyCase) {
  const input = { facts: cs.facts, defaults: LOOK_COPY_DEFAULTS, keys: COPY_PASS_KEYS, primaryLocale: cs.locale };
  const prompt = buildCopyPassPrompt(input);
  const t0 = Date.now();
  const res = await adapter.chatCompletion({ ...prompt, jsonSchema: COPY_PASS_JSON_SCHEMA, maxTokens: COPY_PASS_MAX_TOKENS, model: c.model });
  const ms = Date.now() - t0;
  if (!res.ok) return { ok: false as const, ms, error: `${res.code}: ${res.message}` };
  const screened = screenCopyReply(res.text, input);
  const cost = estimateCostUsd(res.model ?? c.model, res.usage?.inputTokens, res.usage?.outputTokens);
  const headline = screened.copy["home.offer.headline"] ?? screened.copy[Object.keys(screened.copy)[0] ?? ""];
  return {
    ok: true as const,
    ms,
    cost,
    tokens: `${res.usage?.inputTokens ?? "?"}/${res.usage?.outputTokens ?? "?"}`,
    kept: Object.keys(screened.copy).length,
    dropped: screened.dropped,
    sample: headline ? `${headline[cs.locale]}` : "(no headline)",
  };
}

// ─── Run ─────────────────────────────────────────────────────────────────────

const fmt = (n: number, d = 4) => n.toFixed(d);

console.log(`Candidates: ${candidates.map((c) => c.model).join(", ")} · runs per case: ${RUNS}`);
console.log(`Rates ($/M in, $/M out): ${candidates.map((c) => `${c.model}=${rateForModel(c.model).inputPerM}/${rateForModel(c.model).outputPerM}`).join("  ")}`);

if (ONLY !== "copy") {
console.log("\n== EXTRACTION (sentence → facts) ==");
const extractionSummary: Array<{ model: string; cost: number; ms: number; recall: number; wrong: number; extra: number; failures: number; n: number }> = [];
for (const c of candidates) {
  const adapter = adapterFor(c);
  const agg = { model: c.model, cost: 0, ms: 0, recall: 0, wrong: 0, extra: 0, failures: 0, n: 0 };
  for (const cs of EXTRACTION_CASES) {
    for (let r = 0; r < RUNS; r += 1) {
      const out = await runExtraction(c, adapter, cs);
      if (!out.ok) {
        agg.failures += 1;
        console.log(`  ${c.model.padEnd(28)} ${cs.id.padEnd(12)} FAILED ${out.error}`);
        continue;
      }
      agg.n += 1; agg.cost += out.cost; agg.ms += out.ms; agg.recall += out.recall; agg.wrong += out.wrong.length; agg.extra += out.extra.length;
      console.log(`  ${c.model.padEnd(28)} ${cs.id.padEnd(12)} recall=${fmt(out.recall, 2)} wrong=${out.wrong.length} extra=${out.extra.length} rejected=${out.rejected} $${fmt(out.cost)} ${out.ms}ms tok=${out.tokens}${out.parseFailed ? " PARSE_FAILED" : ""}`);
      for (const w of out.wrong) console.log(`      wrong: ${w}`);
      if (out.extra.length) console.log(`      extra: ${out.extra.join(", ")}`);
    }
  }
  extractionSummary.push(agg);
}
console.log("\n  model                        avg$/call  avg ms  recall  wrong  extra  failures");
for (const a of extractionSummary) {
  const n = Math.max(1, a.n);
  console.log(`  ${a.model.padEnd(28)} ${fmt(a.cost / n).padStart(9)}  ${String(Math.round(a.ms / n)).padStart(6)}  ${fmt(a.recall / n, 2).padStart(6)}  ${String(a.wrong).padStart(5)}  ${String(a.extra).padStart(5)}  ${a.failures}`);
}

}
if (ONLY !== "extraction") {
console.log("\n== COPY PASS (facts → site copy) ==");
const copySummary: Array<{ model: string; cost: number; ms: number; kept: number; dropped: number; failures: number; n: number; headlines: string[] }> = [];
for (const c of candidates) {
  const adapter = adapterFor(c);
  const agg = { model: c.model, cost: 0, ms: 0, kept: 0, dropped: 0, failures: 0, n: 0, headlines: [] as string[] };
  for (const cs of COPY_CASES) {
    for (let r = 0; r < RUNS; r += 1) {
      const out = await runCopy(c, adapter, cs);
      if (!out.ok) {
        agg.failures += 1;
        console.log(`  ${c.model.padEnd(28)} ${cs.id.padEnd(12)} FAILED ${out.error}`);
        continue;
      }
      agg.n += 1; agg.cost += out.cost; agg.ms += out.ms; agg.kept += out.kept; agg.dropped += out.dropped.length; agg.headlines.push(out.sample);
      console.log(`  ${c.model.padEnd(28)} ${cs.id.padEnd(12)} kept=${out.kept} dropped=${out.dropped.length} $${fmt(out.cost)} ${out.ms}ms tok=${out.tokens}  "${out.sample}"`);
      for (const d of out.dropped) console.log(`      dropped ${d.key}: ${d.reason}`);
    }
  }
  copySummary.push(agg);
}
console.log("\n  model                        avg$/call  avg ms  kept  dropped  failures  distinct-headlines");
for (const a of copySummary) {
  const n = Math.max(1, a.n);
  // The standing check: a model that writes the same headline for a cleaner,
  // a nail salon and a grill cannot be routed to the writing call, whatever it costs.
  const distinct = new Set(a.headlines.map(normalizeHeadline)).size;
  const verdict = a.headlines.length >= 3 && distinct < a.headlines.length ? "  GENERIC (unfit for copy)" : "";
  console.log(`  ${a.model.padEnd(28)} ${fmt(a.cost / n).padStart(9)}  ${String(Math.round(a.ms / n)).padStart(6)}  ${fmt(a.kept / n, 1).padStart(4)}  ${String(a.dropped).padStart(7)}  ${String(a.failures).padStart(8)}  ${distinct}/${a.headlines.length}${verdict}`);
}
}
