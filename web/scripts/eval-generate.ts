/**
 * Run from `web/`: npm run eval:generate   (requires .env.local with ANTHROPIC_API_KEY)
 *
 * Drives the PURE generateBuilderNodes({brief,scope,generateWithModel}) — the same
 * composer the server action uses — over eval/generate-brief-set.json against the
 * real model (claude-opus-4-8, adaptive thinking + effort:"xhigh", the same config
 * as prod). Writes each validated tree to eval/generate-runs/<ts>/<id>.json plus a
 * summary.json with the deterministic scorecard (AIQ-18) and expectation grade
 * (AIQ-17). This is the measurement loop that makes every prompt/vocab change a
 * measured delta instead of a blind edit.
 *
 * Flags (optional):
 *   --only=<id[,id...]>        run a subset of cases
 *   --scope-filter=page|section
 *   --limit=<n>                cap number of cases
 *   --compare-baseline=<path>  compare aggregates against a frozen baseline (AIQ-29)
 *   --fail-on-quality-drop=<n> exit 1 if mean score drops more than n vs baseline (default 3)
 *   --write-baseline=<path>    write the run's aggregates as a new baseline
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

import { createAnthropicChatAdapter } from "../src/lib/ai/providers/anthropic-adapter";
import {
  generateBuilderNodes,
  type GenerateScope,
  type ModelGenerateFn,
} from "../src/lib/site-admin/builder-core/ai/generate-nodes";
import {
  scoreGeneratedTree,
  evaluateExpectations,
  type Expectation,
} from "../src/lib/site-admin/builder-core/ai/eval-scorecard";
import { judgeCase, type JudgeScores } from "./ai-builder-eval/judge";

const GEN_MODEL = "claude-opus-4-8";

type BriefCase = {
  id: string;
  brief: string;
  scope: GenerateScope;
  locale?: string;
  note?: string;
  expect: Expectation;
};
type BriefSet = { note?: string; cases: BriefCase[] };

function parseFlags(argv: string[]) {
  const flags: Record<string, string> = {};
  for (const a of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(a);
    if (m) flags[m[1]!] = m[2] ?? "true";
  }
  return flags;
}

/** Mirrors the server action's buildModelGenerator, minus session/DB/rate-limit. */
function buildModelGenerator(): ModelGenerateFn {
  const adapter = createAnthropicChatAdapter(); // reads process.env.ANTHROPIC_API_KEY
  return async ({ systemPrompt, userMessage, jsonSchema, maxTokens, repairNote }) => {
    const r = await adapter.chatCompletion({
      systemPrompt,
      userMessage: repairNote ? `${userMessage}\n\n${repairNote}` : userMessage,
      jsonSchema,
      maxTokens,
      model: GEN_MODEL,
      thinking: true,
      effort: "xhigh",
    });
    if (r.ok) return { text: r.text, reason: r.stopReason === "max_tokens" ? "truncated" : "ok" };
    return {
      text: null,
      reason: r.code === "truncated" ? "truncated" : r.code === "empty_response" ? "empty" : "error",
    };
  };
}

type Row = {
  id: string;
  ok: boolean;
  code?: string;
  scope?: GenerateScope;
  nodeCount?: number;
  repaired?: boolean;
  latencyMs: number;
  score?: number;
  errors?: number;
  warns?: number;
  expectationsPass?: boolean;
  failures?: string[];
  judge?: JudgeScores | null;
};

function mean(nums: number[]): number {
  return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error("ANTHROPIC_API_KEY is required for eval:generate (this is a live model run).");
    process.exit(2);
  }
  const flags = parseFlags(process.argv.slice(2));
  const evalDir = resolve(process.cwd(), "eval"); // web/eval (NOT ../eval)
  const set = JSON.parse(readFileSync(resolve(evalDir, "generate-brief-set.json"), "utf8")) as BriefSet;

  let cases = set.cases;
  if (flags.only) {
    const ids = new Set(flags.only.split(","));
    cases = cases.filter((c) => ids.has(c.id));
  }
  if (flags["scope-filter"]) cases = cases.filter((c) => c.scope === flags["scope-filter"]);
  if (flags.limit) cases = cases.slice(0, Number(flags.limit));

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = resolve(evalDir, "generate-runs", stamp);
  mkdirSync(outDir, { recursive: true });

  const generateWithModel = buildModelGenerator();
  const rows: Row[] = [];

  for (const c of cases) {
    const started = Date.now();
    const gen = await generateBuilderNodes({
      brief: c.brief,
      scope: c.scope,
      locale: c.locale,
      generateWithModel,
    });
    if (!gen.ok) {
      const row: Row = { id: c.id, ok: false, code: gen.code, latencyMs: Date.now() - started };
      rows.push(row);
      console.log(JSON.stringify(row));
      continue;
    }
    writeFileSync(resolve(outDir, `${c.id}.json`), JSON.stringify(gen.tree, null, 2), "utf8");
    const card = scoreGeneratedTree(gen.tree);
    const graded = evaluateExpectations(gen.tree, c.expect);
    // AIQ-19 — optional LLM-judge pass (one Opus call per case). Off by default.
    const judge = flags.judge ? await judgeCase(c.brief, gen.tree) : undefined;
    const row: Row = {
      id: c.id,
      ok: true,
      scope: c.scope,
      nodeCount: gen.nodeCount,
      repaired: gen.repaired,
      latencyMs: Date.now() - started,
      score: card.score,
      errors: card.counts.errors,
      warns: card.counts.warns,
      expectationsPass: graded.pass,
      failures: graded.failures,
      judge,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }

  const okRows = rows.filter((r) => r.ok);
  const judged = okRows.filter((r) => r.judge);
  const aggregates = {
    cases_total: cases.length,
    cases_ok: okRows.length,
    cases_expectations_pass: okRows.filter((r) => r.expectationsPass).length,
    mean_score: Number(mean(okRows.map((r) => r.score ?? 0)).toFixed(2)),
    mean_errors: Number(mean(okRows.map((r) => r.errors ?? 0)).toFixed(2)),
    mean_warns: Number(mean(okRows.map((r) => r.warns ?? 0)).toFixed(2)),
    mean_judge: judged.length ? Number(mean(judged.map((r) => r.judge!.mean)).toFixed(2)) : null,
  };
  const summary = { generated_at: new Date().toISOString(), model: GEN_MODEL, out_dir: outDir, aggregates, per_case: rows };
  writeFileSync(resolve(outDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  if (flags["write-baseline"]) {
    writeFileSync(resolve(flags["write-baseline"]), `${JSON.stringify(aggregates, null, 2)}\n`, "utf8");
    console.log(`Wrote baseline → ${flags["write-baseline"]}`);
  }

  console.log(`\n${aggregates.cases_expectations_pass}/${cases.length} expectation-pass, mean score ${aggregates.mean_score}`);
  console.log(`Wrote ${outDir}/summary.json`);

  // AIQ-29 — regression gate against a frozen baseline.
  if (flags["compare-baseline"]) {
    const baseline = JSON.parse(readFileSync(resolve(flags["compare-baseline"]), "utf8")) as typeof aggregates;
    const drop = baseline.mean_score - aggregates.mean_score;
    const limit = Number(flags["fail-on-quality-drop"] ?? 3);
    console.log(`baseline mean_score ${baseline.mean_score} → now ${aggregates.mean_score} (drop ${drop.toFixed(2)}, limit ${limit})`);
    if (drop > limit) {
      console.error(`QUALITY REGRESSION: mean score dropped ${drop.toFixed(2)} > ${limit}`);
      process.exit(1);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
