import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync("src/app/t/[profileCode]/_chat/MiniChatGateForm.tsx", "utf8");

test("TUL-949: Enter in the guest gate fields sends when allowed, never during IME", () => {
  assert.match(src, /e\.key === "Enter" && !e\.nativeEvent\.isComposing && canSend/);
  assert.match(src, /enterKeyHint="send"/);
});

test("TUL-949: the marketing support panel textarea sends on Enter, Shift+Enter is a newline", () => {
  const panel = readFileSync("src/components/marketing/support/MarketingSupportPanel.tsx", "utf8");
  assert.match(panel, /e\.key === "Enter" && !e\.shiftKey && !e\.nativeEvent\.isComposing/);
  assert.match(panel, /enterKeyHint="send"/);
});
