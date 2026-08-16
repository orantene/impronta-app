import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import {
  buildNudgeTranslateStyle,
  resolveNudgeBucket,
} from "./kit/nudge";

/**
 * nudge-device-freshness — regression for a live-QA finding against PR #1146:
 * a tablet nudge (⌥+→ ×4 on `/w/qa-agency-244988/p/wave2-canvas?edit=1`)
 * committed `{"align":"center","translate":"4px 0px"}` — a TOP-LEVEL
 * translate, no `responsive.tablet` bucket anywhere — while the topbar showed
 * Tablet selected. `resolveNudgeBucket("tablet")` and `buildNudgeTranslateStyle`
 * were already unit-tested and green (kit/nudge.test.ts), because those tests
 * pass `device` in directly; the actual bug was in the WIRING around them:
 * `onNudge` (selection-layer.tsx) resolved the bucket from a `device` value
 * closed over when its effect last subscribed, not the current value at
 * keydown time. On this page's duplicate-canvas-copy path (a separate repaint
 * bug tracked against PR #1145) that closure could go stale, so the write
 * silently fell back to the base style — the exact PRE-FIX symptom.
 *
 * THE FIX: `onNudge` now reads a `deviceRef` written unconditionally on every
 * render (`deviceRef.current = device`, the same "latest-value ref" pattern
 * `scheduleRectRecomputeRef` already uses a few lines down), so the bucket
 * resolution is decoupled from the nudge effect's own re-subscription timing.
 *
 * WHAT THIS FILE CAN AND CANNOT PROVE. `selection-layer.tsx` is a ~7,700-line
 * client component that "can't be imported without a DOM" (the same
 * constraint `clipboard-feedback.canvas-7.test.ts` documents for this exact
 * file) — this lane has no React-render harness for it. Static-source
 * assertions are the established remedy here: they can't execute the keydown
 * handler, but they CAN pin exactly the regression that reintroduces the bug
 * — reading `device` directly inside `onNudge`, or dropping the
 * `deviceRef.current = device` write, or the effect regaining `device` as a
 * dep it can silently stay subscribed on. The end-to-end OBSERVABLE-outcome
 * proof (tablet nudge -> tablet frame moves, desktop frame does not) is the
 * live-QA checklist item in the PR body — that is the check this static
 * guard cannot replace, only backstop.
 */

const SELECTION_LAYER_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "selection-layer.tsx",
);

function readSelectionLayerSource(): string {
  return readFileSync(SELECTION_LAYER_PATH, "utf8");
}

test("selection-layer.tsx: deviceRef is synced on every device change, in its own effect", () => {
  const source = readSelectionLayerSource();
  assert.match(
    source,
    /const deviceRef = useRef\(device\);\s*\n\s*useEffect\(\(\) => \{\s*\n\s*deviceRef\.current = device;\s*\n\s*\}, \[device\]\);/,
    "deviceRef must be declared and kept fresh in a dedicated `useEffect` " +
      "keyed on [device] (never written during render — that trips the " +
      "react-hooks/refs lint, which this file already grandfathers exactly " +
      "one occurrence of) so it refreshes on every device change, " +
      "independent of the nudge effect's own dependency array / re-subscribe.",
  );
});

test("selection-layer.tsx: the nudge handler resolves the bucket from deviceRef.current, not the closed-over `device`", () => {
  const source = readSelectionLayerSource();
  assert.match(
    source,
    /const bucket = resolveNudgeBucket\(deviceRef\.current\);/,
    "onNudge must read deviceRef.current at keydown time. Reading the bare " +
      "`device` variable closes over whatever value was current when the " +
      "effect last (re-)subscribed — the exact regression a live-QA pass " +
      "caught: a tablet nudge committed a TOP-LEVEL translate with no " +
      "responsive.tablet bucket anywhere, because the closure had gone stale.",
  );
  assert.doesNotMatch(
    source,
    /resolveNudgeBucket\(device\)/,
    "no call site should resolve the nudge bucket from the bare `device` " +
      "variable — every read must go through deviceRef.current.",
  );
});

test("selection-layer.tsx: the nudge effect's dependency array does not list `device`", () => {
  const source = readSelectionLayerSource();
  const effectStart = source.indexOf("function onNudgeKeyUp(e: KeyboardEvent)");
  assert.notEqual(effectStart, -1, "expected to find the nudge effect's onNudgeKeyUp helper");
  // The deps array is the next `}, [ ... ]);` after the effect body — bounded
  // to a generous window so this stays robust to nearby unrelated edits.
  const window_ = source.slice(effectStart, effectStart + 4000);
  const depsMatch = window_.match(/\}, \[([\s\S]*?)\]\);/);
  assert.ok(depsMatch, "expected to find the nudge effect's dependency array");
  // Strip comment lines first — the deps array carries an explanatory
  // "NOT `device`" comment, which would otherwise false-positive the check
  // below (it mentions the word deliberately, as an entry that is ABSENT).
  const depsCodeOnly = depsMatch![1]
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
  assert.doesNotMatch(
    depsCodeOnly,
    /(?<![.\w])device(?![.\w])/,
    "the nudge effect must NOT depend on `device` — the handler reads the " +
      "current value via deviceRef.current instead, so a device change must " +
      "not need this effect to re-subscribe to stay correct (re-subscribing " +
      "was exactly the mechanism that went stale).",
  );
});

// Belt-and-suspenders on the pure layer: an end-to-end trace of the SAME
// sequence the QA repro ran (⌥+→ four times on Tablet), using the real
// exported functions the fixed handler calls, proving the intended contract
// in isolation: same resolveNudgeBucket + buildNudgeTranslateStyle calls
// (device passed directly, standing in for a fresh deviceRef.current read)
// land in the tablet bucket and never touch the base style.
test("resolveNudgeBucket + buildNudgeTranslateStyle: four tablet nudges land entirely in the tablet bucket, base style untouched", () => {
  let style: Record<string, unknown> = { align: "center" };
  const device = "tablet" as const;
  for (let i = 0; i < 4; i++) {
    const bucket = resolveNudgeBucket(device);
    const current =
      (style.responsive as Record<string, unknown> | undefined)?.["tablet"] as
        | Record<string, unknown>
        | undefined;
    const currentX =
      typeof current?.translate === "string"
        ? Number.parseFloat(current.translate)
        : 0;
    style = buildNudgeTranslateStyle({
      style,
      bucket,
      x: currentX + 1,
      y: 0,
    });
  }
  assert.deepEqual(style, {
    align: "center",
    responsive: { tablet: { translate: "4px 0px" } },
  });
  // The exact bug this guards: NOT the top-level translate the live QA found.
  assert.equal((style as Record<string, unknown>).translate, undefined);
});
