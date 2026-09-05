/**
 * The hardcoded-colour ratchet: no enrolled surface may GAIN a hex literal.
 *
 * Design ruling J3 (Creative Director, 2026-09-03; approved by the CEO): a colour
 * rule living in a checklist and a doc is not enforced. Existing literals are
 * frozen per file in `hex-literal-ratchet.baseline.json`; the number may only
 * go down. Mechanism, surfaces and exemptions live in `hex-literal-ratchet.ts`.
 *
 * Lane: `npm run test:size-ratchet` (wired into `ci` and ci.yml; parity proven
 * by check:ci-lane-parity).
 *
 * HOW TO REACT WHEN THIS FAILS
 * ────────────────────────────
 *   • "+N" on a file → you added a raw colour. Use a token. If the value has no
 *     token yet, ask the Creative Director for one. Do not re-record to pass.
 *   • "-N" on a file → you removed one. Run
 *       node scripts/regen-hex-literal-ratchet-baseline.mjs
 *     and commit the baseline so the win is locked in.
 *   • A new file outside the baseline → it must carry zero literals. There is
 *     no enrolment for new files; they are born token-first.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  type Baseline,
  EXEMPT_FILES,
  HEX_LITERAL,
  SURFACES,
  WEB_ROOT,
  countByFile,
  diffAgainstBaseline,
  explainDrift,
  findHexLiterals,
  scanSurfaces,
  surfaceOf,
  totalsBySurface,
} from "./hex-literal-ratchet";

const BASELINE_PATH = join(WEB_ROOT, "src/lib/quality/hex-literal-ratchet.baseline.json");
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8")) as Baseline;

// ── the gate ────────────────────────────────────────────────────────────────

test("no enrolled surface has gained a hex literal, and every reduction is recorded", () => {
  const drift = diffAgainstBaseline(scanSurfaces(), baseline);
  assert.deepEqual(
    drift,
    [],
    drift.length === 0
      ? ""
      : `\n\nHardcoded colours drifted from hex-literal-ratchet.baseline.json:\n\n${explainDrift(drift)}\n\n` +
        `Only after fixing or justifying the drift, re-record with:\n` +
        `  node scripts/regen-hex-literal-ratchet-baseline.mjs\n`,
  );
});

test("the baseline names only files that still carry a literal", () => {
  const actual = countByFile(scanSurfaces());
  const stale = Object.keys(baseline).filter((f) => !(f in actual));
  assert.deepEqual(stale, [], `\nBaseline names ${stale.length} file(s) with none left:\n  ${stale.join("\n  ")}\n`);
});

test("the baseline is measuring real surfaces", () => {
  // An emptied baseline would otherwise read as green while guarding nothing.
  assert.ok(Object.keys(baseline).length > 0, "baseline is empty: the ratchet guards nothing");
  const totals = totalsBySurface(baseline);
  for (const surface of Object.keys(SURFACES)) {
    assert.ok(totals[surface] > 0, `surface "${surface}" has no baselined files; the enrolment roots may have moved`);
  }
  for (const file of Object.keys(baseline)) {
    assert.ok(surfaceOf(file), `${file} is in the baseline but outside every enrolled surface`);
    assert.ok(!(file in EXEMPT_FILES), `${file} is both exempt and baselined; pick one`);
  }
});

test("every exemption names a file that exists and gives a reason", () => {
  for (const [file, reason] of Object.entries(EXEMPT_FILES)) {
    assert.ok(surfaceOf(file), `${file} is exempt but outside every enrolled surface, so the exemption is dead`);
    assert.ok(reason.trim().length > 20, `${file}: an exemption needs a reason a reviewer can check`);
    assert.doesNotThrow(() => readFileSync(join(WEB_ROOT, file)), `${file} is exempt but does not exist`);
  }
});

// ── detector self-tests: a guard nobody trusts gets suppressed ──────────────

test("BITES: a six-digit hex in code is counted, with its line", () => {
  const src = `const a = 1;\nconst C = { ink: "#0B0B0D", accent: "#0f4f3e" };\n`;
  const hits = findHexLiterals(src, "f.tsx");
  assert.deepEqual(
    hits.map((h) => [h.line, h.value]),
    [
      [2, "#0B0B0D"],
      [2, "#0f4f3e"],
    ],
  );
});

test("BITES: an eight-digit hex counts once, not as six plus noise", () => {
  const hits = findHexLiterals(`style={{ background: "#1e3a2d80" }}`, "f.tsx");
  assert.deepEqual(hits.map((h) => h.value), ["#1e3a2d80"]);
});

test("BITES: CSS files count too", () => {
  const hits = findHexLiterals(`.x { color: #FF8332; border: 1px solid #e0d8c8; }`, "f.css");
  assert.equal(hits.length, 2);
});

test("NOT COUNTED: a three-digit hex, by the audit's definition", () => {
  assert.deepEqual(findHexLiterals(`color: "#fff"; bg: "#000";`, "f.tsx"), []);
});

test("NOT COUNTED: a hash that merely starts with six hex digits", () => {
  const src = `const sha = "#abcdef12345";\nconst id = "#deadbeefcafe";\nconst frag = "#a1b2c3-section";`;
  assert.deepEqual(findHexLiterals(src, "f.ts"), []);
});

test("NOT COUNTED: a hex named in a comment, so history notes stay legal", () => {
  const src =
    `// the old local amber was a warm gold (#8A6F1A) and the token amber replaced it\n` +
    `/* banned: #D4A017 #B8860B */\n` +
    `const color = "var(--color-admin-amber)";\n`;
  assert.deepEqual(findHexLiterals(src, "f.tsx"), []);
});

test("a comment cannot SATISFY a recorded count either", () => {
  // If comments were counted, deleting the real literal and leaving a comment
  // that names it would keep the baseline "tight" while nothing was painted.
  const withLiteral = `const c = "#8A6F1A"; // was #8A6F1A`;
  const commentOnly = `const c = "var(--x)"; // was #8A6F1A`;
  assert.equal(findHexLiterals(withLiteral, "f.tsx").length, 1);
  assert.equal(findHexLiterals(commentOnly, "f.tsx").length, 0);
});

test("the pattern is global, so a line with two literals yields two", () => {
  assert.equal([...`#111111 #222222`.matchAll(HEX_LITERAL)].length, 2);
});

test("RATCHET BITES: a file gaining a literal is reported as drift, with the literal named", () => {
  const hits = [
    { file: "src/app/(workspace)/x.tsx", line: 4, value: "#1d4ed8" },
    { file: "src/app/(workspace)/x.tsx", line: 9, value: "#c0392b" },
  ];
  const drift = diffAgainstBaseline(hits, { "src/app/(workspace)/x.tsx": 1 });
  assert.equal(drift.length, 1);
  assert.equal(drift[0].actual, 2);
  assert.equal(drift[0].recorded, 1);
  const text = explainDrift(drift);
  assert.match(text, /\+1/);
  assert.match(text, /x\.tsx:9\s+#c0392b/);
  assert.match(text, /design token/);
});

test("RATCHET BITES: a NEW file with a literal is drift against an implicit zero", () => {
  const drift = diffAgainstBaseline([{ file: "src/components/admin/new.tsx", line: 1, value: "#000000" }], {});
  assert.deepEqual(drift.map((d) => [d.file, d.recorded, d.actual]), [["src/components/admin/new.tsx", 0, 1]]);
});

test("RATCHET LOCKS IN: a file losing a literal is drift too, asking for a re-record", () => {
  const drift = diffAgainstBaseline([], { "src/app/(marketing)/y.tsx": 3 });
  assert.equal(drift.length, 1);
  assert.match(explainDrift(drift), /Re-record/);
});

test("surfaceOf maps roots and rejects neighbours", () => {
  assert.equal(surfaceOf("src/app/(workspace)/[tenantSlug]/admin/account/page.tsx"), "admin");
  assert.equal(surfaceOf("src/components/marketing/hero-section.tsx"), "marketing");
  assert.equal(surfaceOf("src/components/marketing-extras/x.tsx"), null);
  assert.equal(surfaceOf("src/app/(public)/page.tsx"), null);
});
