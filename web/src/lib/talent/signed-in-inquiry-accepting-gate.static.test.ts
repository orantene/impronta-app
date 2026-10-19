import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// TUL-964: the one-shot submit (signed-in clients and guests from the drawer)
// must honour the talent's "not taking new inquiries" switch on direct channels,
// BEFORE the inquiry is created.
const src = readFileSync("src/app/(workspace)/[tenantSlug]/client/_actions/inquiry-intent-actions.ts", "utf8");

test("submitInquiryNowAction gates on the talent switches before creating the inquiry", () => {
  const start = src.indexOf("export async function submitInquiryNowAction");
  const body = src.slice(start);
  const gate = body.indexOf("firstTalentNotAccepting(");
  const create = body.indexOf("createInquiryFromIntent(");
  assert.ok(gate > 0, "gate present");
  assert.ok(create > gate, "gate runs before createInquiryFromIntent");
  assert.match(body, /isDirectTalentChannel\(/);
  assert.match(body, /loadTalentSiteSwitchesMany\(/);
});
