/**
 * Run from `web/`: npm run eval:search
 * Requires .env.local (Supabase + OpenAI + service role) like local dev.
 *
 * Flags (optional):
 *   --write-summary[=path]   Write JSON summary (default: ../eval/last-search-eval-summary.json)
 *   --compare-baseline=path  Exit 1 if mean precision drops more than --fail-on-precision-drop (default 0.05)
 *   --fail-on-precision-drop=0.05
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { HybridMergeStrategy } from "../src/lib/ai/hybrid-merge";
import { runAiDirectorySearch } from "../src/lib/ai/run-ai-directory-search";

type EvalCase = {
  id: string;
  q: string;
  k?: number;
  expected_in_top_k: string[];
  skip?: boolean;
  note?: string;
};

type EvalFile = {
  version: number;
  default_k: number;
  cases: EvalCase[];
};

type PerCaseMetrics = {
  case: string;
  q: string;
  k: number;
  hits: number;
  expected_count: number;
  precision_at_k: number;
  jaccard_at_k: number | null;
  rr_first_hit: number | null;
  vector_active: boolean;
  merge_strategy: HybridMergeStrategy | undefined;
  fallback_reason: string | null | undefined;
};

type EvalSummary = {
  generated_at: string;
  eval_file: string;
  cases_total: number;
  cases_run: number;
  summary_cases_with_expectations: number;
  mean_precision_at_k: number | null;
  mean_jaccard_at_k: number | null;
  mean_rr_first_hit: number | null;
  per_case: PerCaseMetrics[];
};

function jaccardAtK(topIds: string[], expected: string[]): number | null {
  if (expected.length === 0) return null;
  const top = new Set(topIds.map((t) => t.toLowerCase()));
  const expLower = expected.map((e) => e.toLowerCase());
  let inter = 0;
  for (const e of expLower) {
    if (top.has(e)) inter++;
  }
  const union = new Set([...topIds.map((t) => t.toLowerCase()), ...expLower]);
  return union.size > 0 ? inter / union.size : 0;
}

function reciprocalRankFirstHit(topIds: string[], expected: string[]): number | null {
  const exp = expected.map((e) => e.toLowerCase());
  for (let rank = 0; rank < topIds.length; rank++) {
    const id = topIds[rank]!.toLowerCase();
    if (exp.includes(id)) {
      return 1 / (rank + 1);
    }
  }
  return null;
}

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function parseEvalCli() {
  let writeSummary: string | null = null;
  let compareBaseline: string | null = null;
  let failDrop = 0.05;
  for (const arg of process.argv.slice(2)) {
    if (arg === "--write-summary") {
      writeSummary = resolve(process.cwd(), "..", "eval", "last-search-eval-summary.json");
    } else if (arg.startsWith("--write-summary=")) {
      writeSummary = arg.slice("--write-summary=".length).trim() || null;
    } else if (arg.startsWith("--compare-baseline=")) {
      compareBaseline = arg.slice("--compare-baseline=".length).trim() || null;
    } else if (arg.startsWith("--fail-on-precision-drop=")) {
      const n = Number.parseFloat(arg.slice("--fail-on-precision-drop=".length));
      if (Number.isFinite(n) && n > 0) failDrop = n;
    }
  }
  return { writeSummary, compareBaseline, failDrop };
}

async function main() {
  const { writeSummary, compareBaseline, failDrop } = parseEvalCli();
  const repoRoot = resolve(process.cwd(), "..");
  const jsonPath = resolve(repoRoot, "eval/search-eval-set.json");
  const raw = readFileSync(jsonPath, "utf8");
  const spec = JSON.parse(raw) as EvalFile;

  console.log(`Loaded ${spec.cases.length} cases from eval/search-eval-set.json\n`);

  let ran = 0;
  const precisions: number[] = [];
  const jaccards: number[] = [];
  const rrs: number[] = [];
  const perCase: PerCaseMetrics[] = [];

  for (const c of spec.cases) {
    if (c.skip) {
      console.log(`[SKIP] ${c.id}${c.note ? ` — ${c.note}` : ""}`);
      continue;
    }
    ran++;
    const k = c.k ?? spec.default_k;
    const out = await runAiDirectorySearch({
      rawQ: c.q,
      taxonomyTermIds: [],
      logAnalytics: false,
      limit: Math.max(k, 24),
      includeDebug: true,
    });

    const topIds = out.results.slice(0, k).map((r) => r.talent_id);
    let hits = 0;
    for (const id of c.expected_in_top_k) {
      if (topIds.some((t) => t.toLowerCase() === id.toLowerCase())) hits++;
    }
    const precision =
      c.expected_in_top_k.length > 0 ? hits / c.expected_in_top_k.length : 0;
    const jac = jaccardAtK(topIds, c.expected_in_top_k);
    const rr = reciprocalRankFirstHit(topIds, c.expected_in_top_k);

    if (c.expected_in_top_k.length > 0) {
      precisions.push(precision);
      if (jac != null) jaccards.push(jac);
      if (rr != null) rrs.push(rr);
    }

    const row: PerCaseMetrics = {
      case: c.id,
      q: c.q,
      k,
      hits,
      expected_count: c.expected_in_top_k.length,
      precision_at_k: Number(precision.toFixed(3)),
      jaccard_at_k: jac != null ? Number(jac.toFixed(3)) : null,
      rr_first_hit: rr != null ? Number(rr.toFixed(3)) : null,
      vector_active: out.vector_active,
      merge_strategy: out.debug?.merge_strategy,
      fallback_reason: out.debug?.fallback_reason,
    };
    perCase.push(row);

    console.log(JSON.stringify(row));
  }

  if (ran === 0) {
    console.log(
      "\nNo active cases (all skipped). Un-skip cases and add UUIDs to measure overlap.\n",
    );
    return;
  }

  let meanPrecision: number | null = null;
  let meanJaccard: number | null = null;
  let meanRr: number | null = null;

  if (precisions.length > 0) {
    meanPrecision = Number(mean(precisions).toFixed(3));
    meanJaccard =
      jaccards.length > 0 ? Number(mean(jaccards).toFixed(3)) : null;
    meanRr = rrs.length > 0 ? Number(mean(rrs).toFixed(3)) : null;
    console.log(
      "\n" +
        JSON.stringify({
          summary_cases_with_expectations: precisions.length,
          mean_precision_at_k: meanPrecision,
          mean_jaccard_at_k: meanJaccard,
          mean_rr_first_hit: meanRr,
        }),
    );
  }

  const summary: EvalSummary = {
    generated_at: new Date().toISOString(),
    eval_file: jsonPath,
    cases_total: spec.cases.length,
    cases_run: ran,
    summary_cases_with_expectations: precisions.length,
    mean_precision_at_k: meanPrecision,
    mean_jaccard_at_k: meanJaccard,
    mean_rr_first_hit: meanRr,
    per_case: perCase,
  };

  if (writeSummary) {
    const outPath = resolve(writeSummary);
    writeFileSync(outPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
    console.log(`\nWrote summary: ${outPath}`);
  }

  if (compareBaseline && precisions.length > 0 && meanPrecision != null) {
    const baseRaw = readFileSync(resolve(compareBaseline), "utf8");
    const baseline = JSON.parse(baseRaw) as { mean_precision_at_k?: number };
    const baseP = baseline.mean_precision_at_k;
    if (typeof baseP === "number" && Number.isFinite(baseP)) {
      if (meanPrecision < baseP - failDrop) {
        console.error(
          `\nFAIL: mean_precision_at_k ${meanPrecision} < baseline ${baseP} - tolerance ${failDrop}`,
        );
        process.exit(1);
      }
      console.log(
        `\nBaseline check OK: ${meanPrecision} >= ${baseP} - ${failDrop} (${compareBaseline})`,
      );
    } else {
      console.warn("Baseline file missing numeric mean_precision_at_k; skip compare.");
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
