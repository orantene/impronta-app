/**
 * animation-es-parity.static.test.ts — Spanish coverage for the Animation
 * tab's DATA-DRIVEN copy.
 *
 * `es-parity-inspectors.static.test.ts` harvests string LITERALS out of
 * `inspectors/**`. The Animation gallery has none: every card label and blurb
 * comes from `BUILDER_ANIMATION_PRESET_SPECS`, and the speed chips come from
 * `BUILDER_ANIMATION_SPEED_PRESETS` -- both in `lib/site-admin/builder-node`,
 * outside that guard's walk root entirely. Fifteen card labels, fifteen blurbs
 * and three speed chips would therefore have shipped English-only with every
 * i18n gate green.
 *
 * So this asserts the same contract against the tables themselves.
 *
 * Run: node_modules/.bin/tsx --test \
 *   src/components/edit-chrome/animation-es-parity.static.test.ts
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  BUILDER_ANIMATION_PRESET_SPECS,
  BUILDER_ANIMATION_SPEED_PRESETS,
} from "@/lib/site-admin/builder-node/animation-presets";
import { ES_TEXT } from "./editor-i18n-es";
import { INSPECTOR_TABS, INSPECTOR_TAB_HINT } from "./inspector-tab-config";

function assertTranslated(strings: ReadonlyArray<string>, what: string) {
  const missing = strings.filter((s) => {
    const es = ES_TEXT[s];
    return typeof es !== "string" || es.trim().length === 0;
  });
  assert.deepEqual(
    missing,
    [],
    `${what} with no Spanish entry: ${missing.map((m) => JSON.stringify(m)).join(", ")}. ` +
      `Add them to ES_ANIMATION_TEXT in editor-i18n-es-animation.ts.`,
  );
}

test("every animation preset card label has a Spanish entry", () => {
  assertTranslated(
    BUILDER_ANIMATION_PRESET_SPECS.map((s) => s.label),
    "Animation gallery card label(s)",
  );
});

test("every animation preset blurb has a Spanish entry", () => {
  assertTranslated(
    BUILDER_ANIMATION_PRESET_SPECS.map((s) => s.description),
    "Animation gallery description(s)",
  );
});

test("every speed chip has a Spanish entry", () => {
  assertTranslated(
    BUILDER_ANIMATION_SPEED_PRESETS.map((s) => s.label),
    "Speed chip label(s)",
  );
});

test("the Animation tab label and rail hint have Spanish entries", () => {
  const tab = INSPECTOR_TABS.find((t) => t.key === "motion");
  assert.ok(tab, "The motion tab vanished from INSPECTOR_TABS.");
  assertTranslated([tab.label, INSPECTOR_TAB_HINT.motion], "Animation tab chrome");
});

test("no animation string smuggles a unicode brace escape", () => {
  // A literal `\u{...}` in a catalog crashes the i18n static scanner and turns
  // main red, and neither tsc nor lint sees it. Emoji go in as themselves.
  const all = [
    ...BUILDER_ANIMATION_PRESET_SPECS.flatMap((s) => [s.label, s.description]),
    ...BUILDER_ANIMATION_SPEED_PRESETS.map((s) => s.label),
  ];
  for (const s of all) {
    assert.ok(!s.includes("\\u{"), `Unicode brace escape in ${JSON.stringify(s)}.`);
  }
});
