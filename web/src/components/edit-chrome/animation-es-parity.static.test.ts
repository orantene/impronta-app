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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  BUILDER_ANIMATION_PRESET_SPECS,
  BUILDER_ANIMATION_SPEED_PRESETS,
} from "@/lib/site-admin/builder-node/animation-presets";
import { ES_TEXT } from "./editor-i18n-es";
import { INSPECTOR_TABS, INSPECTOR_TAB_HINT } from "./inspector-tab-config";

const PANEL = join(
  dirname(fileURLToPath(import.meta.url)),
  "inspectors",
  "animation-panel.tsx",
);

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


/**
 * The gap this file did NOT catch the first time, and now does.
 *
 * The kit primitives translate their `label` / `title` / `help` props at one
 * boundary, so a panel that hands its copy to the kit gets Spanish for free.
 * This panel also hand-rolls prose straight into `<span className={HINT}>`,
 * a `<summary>` and a `<button>` -- children, not props -- and those reach the
 * operator without passing through any resolver. Five strings shipped English
 * into a Spanish editor with every i18n gate green, because proving an ES
 * ENTRY EXISTS is not the same as proving anything looks it up.
 *
 * So: every bare-text child in the panel must be a `t(...)` call. Cheap, and it
 * fails on exactly the mistake that was made.
 */
test("the Animation panel has no hand-rolled untranslated prose", () => {
  const source = readFileSync(PANEL, "utf8");
  const offenders: string[] = [];

  // Bare text inside a LOWERCASE (raw DOM) tag. A capitalised tag is a kit
  // component -- `InspectorNotice` translates its children via `tn()`, so its
  // prose is fine as-is and must not be flagged, or the guard trains people to
  // wrap things twice.
  const bareChild = /<(span|summary|button|p|div|label|em|strong)\b[^>]*>\s*([A-Z][A-Za-z][^<>{}]{3,}?)\s*<\//g;
  let m: RegExpExecArray | null;
  while ((m = bareChild.exec(source))) {
    const text = m[2]!.replace(/\s+/g, " ").trim();
    if (/^[\s.,;:>&·-]*$/.test(text)) continue;
    offenders.push(text);
  }

  assert.deepEqual(
    offenders,
    [],
    `Untranslated literal(s) rendered as JSX children: ${offenders
      .map((o) => JSON.stringify(o))
      .join(", ")}. Wrap them in t(...) from useInspectorT -- a string handed ` +
      `to a kit prop is translated at the boundary, but a string written ` +
      `between tags is not, and no other i18n gate can see the difference.`,
  );
});
