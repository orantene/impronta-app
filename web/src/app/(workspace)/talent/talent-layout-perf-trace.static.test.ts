/**
 * TUL-1177: the /talent layout is traced like the workspace admin layout, so
 * `TULALA_PERF_TRACE=1` names the hop or read that dominates the first load.
 * Spans are no-ops without the flag; this pins that the serial hops and every
 * read in the shell wave stay wrapped.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const src = readFileSync(new URL("./_talent-layout-inner.tsx", import.meta.url), "utf8");

test("the talent layout imports the gated perf helpers", () => {
  assert.match(src, /import \{ perfMark, perfStart, timed \} from "@\/lib\/server\/perf-trace"/);
});

test("the serial hops before the shell wave are timed", () => {
  for (const name of [
    "talent.session",
    "talent.resolveDashboardIdentity",
    "talent.loadTalentSelfProfileByUser",
    "talent.getActiveTalentAgencyContext",
    "talent.loadTalentSelfProfile",
  ]) {
    assert.ok(src.includes(`"${name}"`), `${name} span is missing`);
  }
  assert.match(src, /perfMark\("talent\.before-fanout"/);
  assert.match(src, /perfMark\("talent\.after-fanout"/);
});

test("every read in the shell wave carries its own span", () => {
  const wave = src.slice(src.indexOf("await Promise.all(["), src.indexOf('perfMark("talent.after-fanout"'));
  const spans = wave.match(/timed\("talent\./g) ?? [];
  assert.ok(spans.length >= 28, `only ${spans.length} spans in the wave`);
});
