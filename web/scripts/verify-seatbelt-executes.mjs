#!/usr/bin/env node
/**
 * verify-seatbelt-executes.mjs — Marathon W0-T8 exit gate.
 *
 * Closes the D2 silent-skip defect: a React-rendering seatbelt placed under
 * web/src would be SILENTLY NOT COLLECTED by vitest, whose test.include glob
 * only matches test/ + *.test.tsx, giving green CI + false confidence. This
 * script runs vitest (JSON reporter) over the four Wave-0 seatbelts and
 * HARD-FAILS unless each target file is collected AND a marquee assertion from
 * each is observed PASSING. If vitest silently skipped one (wrong path, renamed
 * file, dropped include glob), the expected test name is absent → this exits 1.
 *
 * This is the hard fence in front of Wave 1: no surgery wave may begin until it
 * is green. Wired into the `ci` aggregate.
 *
 * Run from web/: `node scripts/verify-seatbelt-executes.mjs`
 */
import { spawnSync } from "node:child_process";

/**
 * The seatbelt files and, per file, one or more marquee test titles that MUST
 * be present and passing. Titles are matched as substrings of the vitest
 * assertion result title (so they survive minor wording tweaks but still pin
 * that the specific test executed).
 */
const REQUIRED = [
  {
    file: "test/components/edit-chrome/edit-context.test.tsx",
    titles: [
      "selecting a section flips selectedSectionId",
      "openTheme() flips themeOpen",
      // W2-T3 FLIPPED this (was "...re-renders a context consumer"): hover moved
      // to the bridge, so a hover-setter no longer re-renders the consumer.
      "a hover-setter call does NOT re-render a hover-agnostic context consumer",
    ],
  },
  {
    file: "test/components/edit-chrome/edit-context.render-tax.test.tsx",
    titles: [
      // W2-T1 FLIPPED this assertion (was "...still re-renders the canvas"):
      // ClientBuilderCanvas is now React.memo'd, so an identical-prop parent
      // re-render no longer runs the canvas body.
      "a parent re-render with IDENTICAL props does NOT re-render the canvas",
      "repaints the canvas over the WHOLE tree",
    ],
  },
  {
    file: "test/components/edit-chrome/client-builder-canvas.test.tsx",
    titles: [
      "a bridge emit of a NEW tree repaints the canvas",
      "FRESH-IDENTITY sectionEmbedIslands still propagates the new island",
    ],
  },
  {
    file: "test/components/edit-chrome/edit-context.undo.test.tsx",
    titles: [
      "undo→redo round-trips the change through the real closures",
      "VERSION_CONFLICT recovery",
      "REHYDRATES across a remount",
    ],
  },
];

const files = REQUIRED.map((r) => r.file);

const result = spawnSync(
  "node_modules/.bin/vitest",
  ["run", ...files, "--reporter=json"],
  {
    cwd: process.cwd(),
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
    maxBuffer: 64 * 1024 * 1024,
  },
);

// vitest writes the JSON report to stdout; pull the JSON object out (it may be
// preceded/followed by stray lines depending on the environment).
const out = result.stdout ?? "";
const start = out.indexOf("{");
const end = out.lastIndexOf("}");
if (start === -1 || end === -1) {
  console.error(
    "verify:seatbelt-executes — could not parse vitest JSON report. Raw output:\n" +
      out +
      "\n" +
      (result.stderr ?? ""),
  );
  process.exit(1);
}

let report;
try {
  report = JSON.parse(out.slice(start, end + 1));
} catch (err) {
  console.error("verify:seatbelt-executes — JSON parse failed:", err);
  console.error(out);
  process.exit(1);
}

// Flatten every observed assertion: { title, fullName, status, file }.
const observed = [];
for (const suite of report.testResults ?? []) {
  for (const a of suite.assertionResults ?? []) {
    observed.push({
      title: a.title ?? "",
      fullName: a.fullName ?? "",
      status: a.status ?? "",
      file: suite.name ?? "",
    });
  }
}

const collectedFiles = new Set(
  (report.testResults ?? []).map((s) => s.name ?? ""),
);

const failures = [];

for (const { file, titles } of REQUIRED) {
  const fileWasCollected = [...collectedFiles].some((c) => c.endsWith(file));
  if (!fileWasCollected) {
    failures.push(
      `SEATBELT NOT COLLECTED: "${file}" did not appear in the vitest run — it was silently skipped (the exact D2 defect this gate guards).`,
    );
    continue;
  }
  for (const needle of titles) {
    const match = observed.find(
      (o) =>
        (o.fullName.includes(needle) || o.title.includes(needle)) &&
        (o.file.endsWith(file) || true),
    );
    if (!match) {
      failures.push(
        `SEATBELT ASSERTION MISSING: "${needle}" (expected in ${file}) was not found in the executed test report.`,
      );
    } else if (match.status !== "passed") {
      failures.push(
        `SEATBELT ASSERTION NOT PASSING: "${needle}" reported status="${match.status}".`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error("✖ verify:seatbelt-executes FAILED:\n  - " + failures.join("\n  - "));
  process.exit(1);
}

const totalChecked = REQUIRED.reduce((n, r) => n + r.titles.length, 0);
console.log(
  `✓ verify:seatbelt-executes — all ${REQUIRED.length} React-rendering seatbelts collected and ${totalChecked} marquee assertions observed PASSING.`,
);
process.exit(0);
