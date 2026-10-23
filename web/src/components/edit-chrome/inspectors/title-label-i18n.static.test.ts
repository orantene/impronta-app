import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ES_TEXT } from "../editor-i18n-es";

/**
 * QA-B? (builder-lab bounce): the `code_embed`, `menu_board`, `ticket_picker`
 * and `session_picker` content inspectors each hand-rolled
 * `<label className={KIT.label}>Title</label>` instead of handing the text to
 * the inspector kit boundary (a `label=` prop, translated by
 * `inspectors/kit/use-inspector-t.ts`) or calling `t(...)` directly the way
 * the heading/paragraph panels above them already do ({@link
 * "src/components/edit-chrome/inspectors/builder-node-content.tsx"} lines
 * ~617-664: `t("Text")`, `t("Level")`, `t("Copy")`).
 *
 * A bare string between tags is invisible to both the boundary-prop guard
 * (`es-parity-inspectors.static.test.ts`, which only harvests `label=` /
 * `title=` / … props) and the wave-0 `t("literal")` guard, so this one shipped
 * English-only to a Spanish-locale editor with every other i18n gate green --
 * the same gap `animation-es-parity.static.test.ts` found and pinned for the
 * Animation panel. This locks in the fix for this file's four "Title" labels.
 */

const SRC = readFileSync(
  new URL("./builder-node-content.tsx", import.meta.url),
  "utf8",
);

test("builder-node-content: no hand-rolled, untranslated \"Title\" label", () => {
  assert.doesNotMatch(
    SRC,
    /<label className=\{KIT\.label\}>Title<\/label>/,
    'a bare <label>Title</label> reaches the operator untranslated; wrap it in {t("Title")}',
  );
});

test('builder-node-content: every "Title" label is wired through t(...)', () => {
  const matches = [...SRC.matchAll(/<label className=\{KIT\.label\}>\{t\("Title"\)\}<\/label>/g)];
  // code_embed, menu_board, ticket_picker, session_picker.
  assert.ok(
    matches.length >= 4,
    `expected at least 4 Title labels wired through t(...), found ${matches.length}`,
  );
});

test('"Title" has a Spanish catalog entry', () => {
  assert.equal(ES_TEXT["Title"], "Título");
});
