/** Guest AI limiter fails closed on a store error (TUL-618 followup). Lane: test:ai-guardrails. */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { GUEST_AI_STORE_ERROR } from "@/lib/rate-limit-kv-guest-support";

test("store-error result for guest AI is a rate_limited refusal", () => {
  assert.equal(GUEST_AI_STORE_ERROR.ok, false);
  assert.equal(!GUEST_AI_STORE_ERROR.ok && GUEST_AI_STORE_ERROR.code, "rate_limited");
});

test("only the AI limiter is wired fail-closed; create/message stay open", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/rate-limit-kv-guest-support.ts"), "utf8");
  assert.ok(src.includes('key, "aiIp", true)'));
  assert.equal((src.match(/, true\)/g) ?? []).length, 1);
});

test("route maps a refusal to 429 and the panel shows localized copy", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/ai/guest-support-chat/route.ts"), "utf8");
  assert.match(route, /checkSupportGuestAiByIp\(ip\);\s+if \(!ipLimit\.ok\)[\s\S]{0,160}status: 429/);
  const panel = readFileSync(join(process.cwd(), "src/components/marketing/support/MarketingSupportPanel.tsx"), "utf8");
  assert.ok(panel.includes("copy.answerUnavailable"));
});
