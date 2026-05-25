#!/usr/bin/env node
/**
 * Cursor SDK runner for talent-Tulala-dashboard phases.
 *
 * Usage:
 *   node scripts/agent/run-phase.mjs <phase>      # a | b | c | d | e | f
 *   node scripts/agent/run-phase.mjs <phase> --dry-run
 *
 * Reads the matching prompt body from docs/plans/agent-prompts/phase-<phase>.md,
 * concatenates the shared preamble + the master plan reference, then either
 * prints the composed prompt (dry-run) or hands it to a Cursor agent.
 *
 * Required env:
 *   CURSOR_API_KEY   — user/service key from https://cursor.com/dashboard/integrations
 *   CURSOR_MODEL     — optional override (default: composer-2.5)
 *
 * Exit codes (per SDK best practices):
 *   0  finished cleanly
 *   1  startup failure (auth/config/network)  — CursorAgentError
 *   2  run failure                            — result.status === "error"
 *   3  usage / argument error
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..", "..");
const PROMPTS_DIR = resolve(ROOT, "docs", "plans", "agent-prompts");
const PLAN_DOC = resolve(
  ROOT,
  "docs",
  "plans",
  "talent-tulala-dashboard-execution-plan-2026-05-25.md",
);

const VALID_PHASES = ["a", "b", "c", "d", "e", "f"];

function usage(extra) {
  if (extra) console.error(extra + "\n");
  console.error(
    "Usage: node scripts/agent/run-phase.mjs <phase> [--dry-run]\n" +
      "  phase: " +
      VALID_PHASES.join(" | "),
  );
  process.exit(3);
}

const [phaseArgRaw, ...rest] = process.argv.slice(2);
if (!phaseArgRaw) usage("Missing <phase> argument.");
const phase = phaseArgRaw.toLowerCase();
if (!VALID_PHASES.includes(phase)) usage(`Unknown phase: ${phaseArgRaw}`);
const dryRun = rest.includes("--dry-run");

const preamblePath = resolve(PROMPTS_DIR, "_preamble.md");
const phasePath = resolve(PROMPTS_DIR, `phase-${phase}.md`);
for (const p of [preamblePath, phasePath, PLAN_DOC]) {
  if (!existsSync(p)) {
    console.error(`Required file missing: ${p}`);
    process.exit(3);
  }
}

const preamble = readFileSync(preamblePath, "utf8");
const body = readFileSync(phasePath, "utf8");
const planRelPath = "docs/plans/talent-tulala-dashboard-execution-plan-2026-05-25.md";

const composed = [
  preamble.trim(),
  "",
  "---",
  "",
  `## Master plan (single source of truth)`,
  ``,
  `Read \`${planRelPath}\` end to end before doing anything else.`,
  ``,
  "---",
  "",
  body.trim(),
  "",
].join("\n");

if (dryRun) {
  console.log(composed);
  process.exit(0);
}

if (!process.env.CURSOR_API_KEY) {
  console.error(
    "CURSOR_API_KEY is not set. Mint one at https://cursor.com/dashboard/integrations\n" +
      "Then: export CURSOR_API_KEY=cursor_...",
  );
  process.exit(1);
}

let sdk;
try {
  sdk = await import("@cursor/sdk");
} catch (err) {
  console.error(
    "@cursor/sdk is not installed.\n" +
      "  npm install --save-dev @cursor/sdk\n" +
      "(or run the 'Install Cursor SDK' task)\n\n" +
      `Original error: ${err?.message ?? err}`,
  );
  process.exit(1);
}

const { Agent, CursorAgentError } = sdk;
const modelId = process.env.CURSOR_MODEL ?? "composer-2.5";
const phaseLabel = `Phase ${phase.toUpperCase()}`;

console.log(`▶ ${phaseLabel} — starting Cursor agent (model=${modelId})`);
console.log(`▶ cwd=${ROOT}`);

try {
  const result = await Agent.prompt(composed, {
    apiKey: process.env.CURSOR_API_KEY,
    model: { id: modelId },
    local: { cwd: ROOT, settingSources: [] },
  });

  console.log(`\n— ${phaseLabel} finished —`);
  console.log(`status: ${result.status}`);
  if (result.id) console.log(`run id: ${result.id}`);
  if (result.result) {
    console.log("\nFinal assistant text:\n");
    console.log(result.result);
  }
  if (result.status === "error") {
    console.error(`${phaseLabel} run failed — see run id above.`);
    process.exit(2);
  }
  process.exit(0);
} catch (err) {
  if (err && err.constructor && err.constructor.name === "CursorAgentError") {
    console.error(
      `${phaseLabel} did not start (CursorAgentError): ${err.message}\n` +
        `retryable=${err.isRetryable ?? "?"}`,
    );
    process.exit(1);
  }
  throw err;
}
