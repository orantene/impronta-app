import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { getPricingLaddersCopy } from "./pricing-ladders-copy";
import { buildGuestCorpus } from "@/lib/support/guest-corpus";

/**
 * TUL-1414. The Tulala service fee is set per plan in Platform Admin, so no
 * public copy or support bot text may state it as a fixed 6%. Static marketing
 * copy and the bot's knowledge say "Tulala service fee" / "tarifa de servicio
 * de Tulala" with no percentage.
 *
 * Out of scope on purpose: `ticket-fee-comparison.ts` (its fallback constant is
 * pinned to live config by check-compare-table-drift and its table renders the
 * rate read from config) and test files.
 */

const STALE_FEE =
  /(^|[^\d.])6 ?%|\b0\.06\b|\b6 por ciento\b|six percent|six per cent|seis por ciento|seis por/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

const EXCLUDED = new Set(["src/lib/marketing/ticket-fee-comparison.ts"]);

test("no public marketing or support source hard-codes the 6% fee", () => {
  const files = [
    ...walk("src/lib/marketing"),
    ...walk("src/lib/support"),
    "src/app/(marketing)/pricing/page.tsx",
  ].filter((f) => !EXCLUDED.has(f));
  const hits: string[] = [];
  for (const f of files) {
    readFileSync(f, "utf8")
      .split("\n")
      .forEach((line, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments are not user-facing
        if (STALE_FEE.test(line)) hits.push(`${f}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
  }
  assert.deepEqual(hits, [], `hard-coded 6% fee copy:\n${hits.join("\n")}`);
});

test("rendered pricing ladder fee card and bot corpus carry no percentage fee", () => {
  for (const locale of ["en", "es"]) {
    const fee = getPricingLaddersCopy(locale).fee;
    const text = JSON.stringify(fee);
    assert.ok(!STALE_FEE.test(text), `${locale} fee card still states 6%`);
    assert.ok(!/\$1,030|\$60\b/.test(text), `${locale} fee card keeps the 6% worked example`);
    for (const e of buildGuestCorpus(locale)) {
      const body = `${e.purpose} ${(e.youCanHere ?? []).join(" ")} ${(e.faqs ?? [])
        .map((q) => `${q.q} ${q.a}`)
        .join(" ")}`;
      assert.ok(!STALE_FEE.test(body), `${locale} bot entry ${e.slug} states the 6% fee`);
    }
  }
});

test("the neutral wording is used, in both languages", () => {
  const en = JSON.stringify(getPricingLaddersCopy("en").fee);
  const es = JSON.stringify(getPricingLaddersCopy("es").fee);
  assert.match(en, /Tulala service fee/);
  assert.match(es, /tarifa de servicio de Tulala/);
});
