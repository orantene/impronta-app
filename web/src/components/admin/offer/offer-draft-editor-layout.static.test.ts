/**
 * TUL-381: the offer draft editor must stack in a narrow panel, label every
 * control, and put Send after the editor (edit -> save -> send).
 * Source-text checks, so a regression to the old structure fails here.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const editor = read("../shell/internal/messages/shared/machinery-11.tsx");
const panel = read("../shell/internal/messages/shared/machinery-12.tsx");
const split = read("./offer-money-split.tsx");

/** Slice of the line-item map: from the row div to the editor footer. */
const rows = editor.slice(editor.indexOf("snapshot.lineItems.map((li)"), editor.indexOf("<OfferEditorFooter"));

test("editor root is a container and rows stack by PANEL width", () => {
  assert.match(editor, /data-offer-draft-editor[\s\S]{0,400}className="@container min-w-0"/);
  assert.match(rows, /className=\{OFFER_LINE_ROW_CLASS\}/);
  assert.match(split, /OFFER_LINE_ROW_CLASS =\s*"grid grid-cols-1[^"]*@\[640px\]:grid-cols-\[/);
  assert.doesNotMatch(rows, /gridTemplateColumns/, "fixed inline 6-column grid is the old overflow bug");
  assert.match(split, /"hidden grid-cols-\[[^"]*@\[640px\]:grid"/, "column headers only in table layout");
});

test("every line control is labelled", () => {
  const controls = rows.match(/<(select|input)\b[^>]*>/g) ?? [];
  assert.ok(controls.length >= 6, "expected the 6 line controls");
  for (const c of controls) assert.match(c, /aria-label=/, `unlabelled control: ${c.slice(0, 80)}`);
  assert.match(rows, /<button type="button" onClick=\{\(\) => removeLine[^>]*aria-label=/);
  assert.equal((rows.match(/OFFER_LINE_LABEL_CLASS/g) ?? []).length, 5, "visible label for the 5 stacked fields");
});

test("footer fee input (the lone number next to Save) is labelled", () => {
  const input = split.match(/<input[^>]*id="offer-agency-fee"[\s\S]*?\/>/)?.[0] ?? "";
  assert.match(input, /aria-label=/);
  assert.match(split, /htmlFor="offer-agency-fee"/);
});

test("action order is edit -> save -> send in the rendered panel", () => {
  const editorAt = panel.indexOf("<OfferDraftEditor ");
  const sendAt = panel.indexOf('t("dashboard.adminTabs.offer.sendToClient")');
  assert.ok(editorAt > 0 && sendAt > editorAt, "Send must render after the editor");
  assert.equal((panel.match(/offer\.sendToClient/g) ?? []).length, 1);
  assert.ok(split.indexOf("onAddLine") < split.indexOf("data-offer-save-draft"), "save follows editing controls");
  assert.ok(editor.indexOf("<OfferEditorFooter") < editor.indexOf("<OfferTermsComposer"));
});
