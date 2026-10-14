import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const thread = readFileSync("src/components/support/SupportThreadView.tsx", "utf8");
const header = readFileSync("src/components/support/SupportThreadHeader.tsx", "utf8");
const home = readFileSync("src/components/support/SupportPanelHome.tsx", "utf8");

test("TUL-942: the in-bubble talk-to-human button is skipped when an offer card exists", () => {
  assert.match(thread, /hasOfferCard/);
  assert.match(thread, /canOfferHuman\(ticket\) && !hasOfferCard/);
});

test("TUL-943: the No button stays after escalation and just dismisses the row", () => {
  assert.match(thread, /canOfferHuman\(ticket\) \? onRequestHuman : \(\) => setAcked/);
});

test("TUL-948: the thinking bubble goes through shouldShowThinking", () => {
  assert.match(thread, /shouldShowThinking\(thinking, messages\)/);
});

test("TUL-944: the thread header title and status may wrap instead of ellipsis", () => {
  assert.match(header, /WebkitLineClamp: 2/);
  assert.doesNotMatch(header, /whiteSpace: "nowrap"/);
});

test("TUL-949: the ask box is a form so Enter on any mobile keyboard submits", () => {
  assert.match(home, /<form[\s\S]*onSubmit=/);
  assert.match(home, /enterKeyHint="send"/);
});
