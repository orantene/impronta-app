/**
 * GRK-054 — directory card Inquire must open inquiry, not silently toggle
 * the shortlist (`saved_talent` / cart).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const ACTIONS = readFileSync(
  join(process.cwd(), "src/components/talent-cards/talent-card-actions.tsx"),
  "utf8",
);
const LAUNCHER = readFileSync(
  join(
    process.cwd(),
    "src/app/t/[profileCode]/_chat/TalentProfileChatLauncher.tsx",
  ),
  "utf8",
);

test("GRK-054: card Inquire calls requestSeparateInquiry, not toggleInCart", () => {
  assert.match(ACTIONS, /requestSeparateInquiry/);
  assert.doesNotMatch(ACTIONS, /toggleInCart/);
  assert.doesNotMatch(ACTIONS, /cart\.setInCart/);
});

test("GRK-054: separate-inquiry launcher does not write saved_talent cart", () => {
  // The separate-inquiry effect must open the draft without setInCart.
  const effectStart = LAUNCHER.indexOf("separateInquiryRequest");
  assert.ok(effectStart > 0);
  const effectSlice = LAUNCHER.slice(effectStart, effectStart + 1800);
  assert.match(effectSlice, /forceNew:\s*true/);
  assert.doesNotMatch(effectSlice, /setInCart/);
});
