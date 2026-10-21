/**
 * TUL-1061: one source of truth for fee rates, and no unverified fee shown to
 * users. Fails when a hardcoded Tulala client-fee or Stripe card-rate literal
 * appears in src/ outside fee-config.ts, or when an unverified fee figure
 * (international-card surcharge, FX surcharge, the "5.4% + 0.30" figure,
 * stablecoin payout fee) reaches code or message files.
 *
 * Comments are ignored (they do not reach users). A line can opt out with
 * `fee-config-ok:` plus a reason (used for a competitor's published rate).
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";

const SRC = join(process.cwd(), "src");
const MESSAGES = join(process.cwd(), "messages");

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .split("\n")
    .map((l) => (/^\s*\/\//.test(l) ? "" : l))
    .join("\n");
}

/** The marker may sit on the line itself or on the line just above. */
function optedOut(raw: string[], i: number): boolean {
  return raw[i].includes("fee-config-ok:") || (i > 0 && raw[i - 1].includes("fee-config-ok:"));
}

const CONFIG_FILE = "lib/billing/fee-config.ts";

// Literal tokens that must only exist in the config.
const RATE_LITERALS: readonly [string, RegExp][] = [
  ["0.015 client fee", /(?<![\d.])0\.015(?!\d)(?!\]|\)|em\b)/],
  ["1.5% client fee", /(?<![\d.])1\.5\s?%/],
  ["0.029 US card rate", /(?<![\d.])0\.029(?!\d)/],
  ["2.9% US card rate", /(?<![\d.])2\.9\s?%/],
  ["0.036 MX card rate", /(?<![\d.])0\.036(?!\d)/],
  ["3.6% MX card rate", /(?<![\d.])3\.6\s?%/],
  ["percentBps 290", /percentBps:\s*290\b/],
  ["fixed_cents literal", /fixed_cents:\s*(?:30|300)\b/],
];

// Unverified figures: never in code strings or messages shown to users.
const UNVERIFIED: readonly [string, RegExp][] = [
  ["5.4% + 0.30 figure", /5\.4\s?%/],
  ["international card surcharge", /international[\s-]+(?:card|payment)s?\s+(?:fee|surcharge)|tarjetas?\s+internacional(?:es)?\s+(?:comisi|cargo)/i],
  ["FX surcharge", /\+\s?1\s?%\s?(?:fx|currency|conversi)|(?:fx|currency[\s-]conversion)\s+(?:fee|surcharge)|conversion\s+surcharge/i],
  ["stablecoin payout fee", /stablecoin[^\n]{0,40}(?:fee|1\s?%\s?\+)|(?:usdc)[^\n]{0,40}\bfee\b|1\s?%\s?\+\s?\$?0?\.25/i],
  ["instant payout fee", /instant\s+payouts?[^\n]{0,40}\b1\s?%/i],
];

describe("fee literals live only in fee-config.ts", () => {
  const files = walk(SRC);
  for (const [name, re] of RATE_LITERALS) {
    it(`no hardcoded ${name} outside the config`, () => {
      const hits: string[] = [];
      for (const f of files) {
        const rel = relative(SRC, f).replaceAll("\\", "/");
        if (rel === CONFIG_FILE) continue;
        const raw = readFileSync(f, "utf8").split("\n");
        const lines = stripComments(raw.join("\n")).split("\n");
        lines.forEach((line, i) => {
          if (optedOut(raw, i)) return;
          if (/rgba?\(|hsla?\(|\bbg-|tracking|letterSpacing/.test(line)) return; // colour / typography, not a fee
          if (re.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 100)}`);
        });
      }
      assert.deepEqual(hits, [], `Route through src/lib/billing/fee-config.ts:\n${hits.join("\n")}`);
    });
  }
});

describe("no unverified fee is user-visible", () => {
  it("source strings", () => {
    const hits: string[] = [];
    for (const f of walk(SRC)) {
      const rel = relative(SRC, f).replaceAll("\\", "/");
      if (rel === CONFIG_FILE) continue;
      const raw = readFileSync(f, "utf8").split("\n");
      const lines = stripComments(raw.join("\n")).split("\n");
      lines.forEach((line, i) => {
        if (optedOut(raw, i)) return;
        for (const [name, re] of UNVERIFIED) if (re.test(line)) hits.push(`${rel}:${i + 1} [${name}]`);
      });
    }
    assert.deepEqual(hits, [], hits.join("\n"));
  });

  it("messages/*.json", () => {
    const hits: string[] = [];
    for (const name of readdirSync(MESSAGES).filter((n) => n.endsWith(".json"))) {
      const lines = readFileSync(join(MESSAGES, name), "utf8").split("\n");
      lines.forEach((line, i) => {
        for (const [label, re] of UNVERIFIED) if (re.test(line)) hits.push(`${name}:${i + 1} [${label}]`);
      });
    }
    assert.deepEqual(hits, [], hits.join("\n"));
  });
});

describe("TUL-1061 follow-up: the plan feature list reads the fee from fee-config", () => {
  it("renders the same words as before, from the configured rate", async () => {
    const { APPROVED_TIER_TABLE } = await import("../access/plan-tier-table");
    const text = JSON.stringify(APPROVED_TIER_TABLE);
    assert.match(text, /Payments \(\+1\.5% client fee\)/);
    assert.match(text, /Pagos \(\+1\.5% de cargo al cliente\)/);
  });
});
