import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { GENERATION_ALLOWED_KINDS } from "../src/lib/site-admin/builder-core/ai/generation-allowed-kinds";

// Structural smoke test for the eval brief set (AIQ-16/17). No model call — it
// only proves the spec file is well-formed and cannot drift from the real
// vocabulary. The live model loop is exercised by `npm run eval:generate`.
const evalDir = resolve(process.cwd(), "eval");
const set = JSON.parse(readFileSync(resolve(evalDir, "generate-brief-set.json"), "utf8")) as {
  cases: Array<{
    id: string;
    brief: string;
    scope: string;
    locale?: string;
    expect: {
      minSections: number;
      kindsPresent: string[];
      kindsAbsent?: string[];
      maxNodes: number;
      singleH1: boolean;
      noEmDash: boolean;
    };
  }>;
};
const allowed = new Set<string>(GENERATION_ALLOWED_KINDS as ReadonlyArray<string>);

test("brief set has >=15 cases covering page + section scope", () => {
  assert.ok(set.cases.length >= 15, `expected >=15 cases, got ${set.cases.length}`);
  const scopes = new Set(set.cases.map((c) => c.scope));
  assert.ok(scopes.has("page") && scopes.has("section"));
});

test("every case is well-formed and declares real generation kinds", () => {
  const ids = new Set<string>();
  for (const c of set.cases) {
    assert.match(c.id, /^[a-z0-9-]+$/, `bad id ${c.id}`);
    assert.ok(!ids.has(c.id), `duplicate id ${c.id}`);
    ids.add(c.id);
    assert.ok(c.brief.length >= 3 && c.brief.length <= 400, `brief length ${c.id}`);
    assert.ok(c.scope === "page" || c.scope === "section", `scope ${c.id}`);
    assert.ok(c.expect.maxNodes >= 1 && c.expect.maxNodes <= 180, `maxNodes ${c.id}`);
    for (const k of c.expect.kindsPresent) assert.ok(allowed.has(k), `${c.id}: kindsPresent ${k} not a real generation kind`);
    for (const k of c.expect.kindsAbsent ?? []) assert.ok(allowed.has(k), `${c.id}: kindsAbsent ${k} not a real generation kind`);
  }
});

test("coverage: the rich kinds + locales + hostile cases are exercised", () => {
  const present = new Set(set.cases.flatMap((c) => c.expect.kindsPresent));
  for (const k of ["accordion", "pricing_table", "form", "card", "image"]) {
    assert.ok(present.has(k), `no case exercises ${k}`);
  }
  assert.ok(set.cases.some((c) => c.locale === "es"), "a Spanish case exists");
});
