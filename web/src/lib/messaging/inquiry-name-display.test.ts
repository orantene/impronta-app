/**
 * TUL-536 (live FAIL 2026-10-11): the Spanish inbox showed the stored English
 * fallback "Visitor" under each Visitante row and in the thread header. The
 * fallback stays English in storage; every display site localizes it.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/lib/messaging/inquiry-name-display.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { displayInquiryName, fallbackName } from "./inquiry-name-pure";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("the stored visitor fallback and blanks display as the localized label", () => {
  assert.equal(displayInquiryName(fallbackName(""), "Visitante"), "Visitante");
  assert.equal(displayInquiryName("  Visitor ", "Visitante"), "Visitante");
  assert.equal(displayInquiryName("   ", "Visitante"), "Visitante");
});

test("real names and renamed subjects pass through untouched", () => {
  assert.equal(displayInquiryName(" Marco Ruiz ", "Visitante"), "Marco Ruiz");
  assert.equal(displayInquiryName("Cena para 6 · sáb", "Visitante"), "Cena para 6 · sáb");
});

test("inbox row subject, thread header and merge card localize the fallback", () => {
  const row = read("../../components/messages-v5/kit/InboxRowV5.tsx");
  assert.match(row, /displayInquiryName\(row\.subject, copy\.inbox\.visitor\)/);
  assert.match(row, /<span className="l2">\{subject\}<\/span>/);
  assert.match(row, /<span className="sub">\{subject\}<\/span>/);

  const header = read("../../components/messages-v5/kit/ThreadHeader.tsx");
  assert.match(header, /displayInquiryName\(essentials\.name, copy\.inbox\.visitor\)/);

  const shell = read("../../components/messages-v5/shell/MessagesV5Shell.tsx");
  assert.match(shell, /name: displayInquiryName\(essentials\?\.name \?\? activeRow\.subject, copy\.kit\.inbox\.visitor\)/);
  assert.match(shell, /name: displayInquiryName\(dupe\.other\.subject, copy\.kit\.inbox\.visitor\)/);
});
