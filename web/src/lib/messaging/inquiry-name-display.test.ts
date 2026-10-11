/**
 * TUL-536 (live FAIL 2026-10-11): the Spanish inbox showed the stored English
 * fallback "Visitor". Row and thread header localize it (TUL-379, #3433); the
 * "Same person?" merge card must too.
 *
 * Run: NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx --test src/lib/messaging/inquiry-name-display.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { fallbackName, localiseInquiryName } from "./inquiry-name-pure";

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), "utf8");

test("the stored visitor fallback displays as the localized label", () => {
  assert.equal(localiseInquiryName(fallbackName(""), "Visitante"), "Visitante");
  assert.equal(localiseInquiryName("Cena para 6 · sáb", "Visitante"), "Cena para 6 · sáb");
});

test("merge card names localize the visitor fallback", () => {
  const shell = read("../../components/messages-v5/shell/MessagesV5Shell.tsx");
  assert.match(shell, /name: localiseInquiryName\(essentials\?\.name \?\? activeRow\.subject, copy\.kit\.inbox\.visitor\)/);
  assert.match(shell, /name: localiseInquiryName\(dupe\.other\.subject, copy\.kit\.inbox\.visitor\)/);
});
