import assert from "node:assert/strict";
import { test } from "node:test";

import { sanitizeSupportAiOutput, SUPPORT_AI_MAX_CHARS } from "./support-ai-guardrails";

test("caps length at 1200", () => {
  const r = sanitizeSupportAiOutput("x".repeat(2000));
  assert.equal(r.text.length, SUPPORT_AI_MAX_CHARS);
  assert.equal(r.escalate, false);
});

test("strips off-allowlist links and keeps tulala.digital", () => {
  const r = sanitizeSupportAiOutput(
    "See [docs](https://evil.example/phish) and https://tulala.digital/help",
  );
  assert.equal(r.text.includes("evil.example"), false);
  assert.equal(r.text.includes("https://tulala.digital/help"), true);
  assert.equal(r.text.includes("docs"), true);
});

test("a tenant-slug path on a foreign host never survives (host-blind bypass)", () => {
  const r = sanitizeSupportAiOutput(
    "Reset here: https://attacker.tld/impronta/reset-password and [go](https://attacker.tld/impronta/admin)",
  );
  assert.equal(r.text.includes("attacker.tld"), false);
});

test("forbidden refund/legal/payout language forces escalate", () => {
  const r = sanitizeSupportAiOutput("We can issue a refund of $400 today.");
  assert.equal(r.escalate, true);
  assert.equal(r.escalateReason, "ai_suggested");
});
