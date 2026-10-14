import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { showNewQuestionStrip } from "./support-new-question-strip";

test("the new-question strip shows for resolved AND closed tickets, never open", () => {
  assert.equal(showNewQuestionStrip("resolved"), true);
  assert.equal(showNewQuestionStrip("closed"), true);
  assert.equal(showNewQuestionStrip("open"), false);
  assert.equal(showNewQuestionStrip(undefined), false);
});

test("the panel renders the strip through the extracted component, not an inline resolved-only block", () => {
  const panel = readFileSync(join(process.cwd(), "src/components/support/SupportPanel.tsx"), "utf8");
  assert.match(panel, /<NewQuestionStrip/);
  assert.doesNotMatch(panel, /ticket\?\.status === "resolved" \?/);
});

test("the client sends the panel locale to the support-chat route", () => {
  const panel = readFileSync(join(process.cwd(), "src/components/support/SupportPanel.tsx"), "utf8");
  assert.match(panel, /JSON\.stringify\(\{ ticketId: id, locale/);
});
