import { test } from "node:test";
import assert from "node:assert/strict";
import { llmFailureReason, planBookingFallback, safeProviderDetail } from "./fallback";
import { bookingAssistantFollowUpAckCopy, bookingAssistantHandoffCopy } from "./handoff";

test("first fallback hands off, later fallback acknowledges", () => {
  assert.deepEqual(planBookingFallback(false), { kind: "handoff" });
  assert.deepEqual(planBookingFallback(true), { kind: "ack" });
});

test("llm failure reasons", () => {
  assert.equal(llmFailureReason("timeout"), "llm_timeout");
  assert.equal(llmFailureReason("api_error"), "llm_error");
  assert.equal(llmFailureReason(undefined), "llm_error");
});

test("provider detail drops key-shaped tokens and caps length", () => {
  const out = safeProviderDetail("bad key sk-ant-abcdefghijkl1234 for request");
  assert.equal(out.includes("abcdefghijkl1234"), false);
  assert.ok(safeProviderDetail("x".repeat(500)).length <= 160);
  assert.equal(safeProviderDetail(null), "");
});

test("ack copy differs from the handoff copy and has no em dash", () => {
  for (const locale of ["en", "es"] as const) {
    const ack = bookingAssistantFollowUpAckCopy(locale);
    assert.notEqual(ack, bookingAssistantHandoffCopy("unsure", locale));
    assert.equal(ack.includes("—"), false);
  }
  assert.ok(bookingAssistantHandoffCopy("unsure", "es").includes("aquí"));
});

test("turn wiring: every fallback path logs a reason and a handed-off thread gets the ack", async () => {
  const { readFileSync } = await import("node:fs");
  const { blankComments } = await import("@/lib/quality/supabase-unchecked-read");
  const src = blankComments(readFileSync(new URL("./turn.server.ts", import.meta.url), "utf8"));
  for (const reason of ["no_anthropic_key", "monthly_cap", "failReason", "why"]) {
    assert.ok(src.includes(reason), reason);
  }
  assert.ok(src.includes("booking_assistant_fallback"));
  assert.ok(src.includes('postAck("already_handed_off")'));
});

test("empty catalog copy is helpful, accented, differs from the handoff", async () => {
  const { bookingAssistantEmptyCatalogCopy } = await import("./handoff");
  for (const l of ["en", "es"] as const) {
    const t = bookingAssistantEmptyCatalogCopy(l);
    assert.notEqual(t, bookingAssistantHandoffCopy("unsure", l));
    assert.equal(t.includes("—"), false);
  }
  assert.ok(bookingAssistantEmptyCatalogCopy("es").includes("aquí"));
  const { readFileSync } = await import("node:fs");
  assert.ok(readFileSync(new URL("./turn.server.ts", import.meta.url), "utf8").includes("bookingAssistantEmptyCatalogCopy(locale)"));
});
