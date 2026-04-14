import test from "node:test";
import assert from "node:assert/strict";

import {
  INQUIRY_DRAFT_MAX_CHARS,
  sanitizeInquiryDraftOutput,
} from "@/lib/ai/inquiry-draft-guardrails";

test("sanitizeInquiryDraftOutput strips currency and pricing hints", () => {
  const s = sanitizeInquiryDraftOutput(
    "Hello — budget is $500 and rate: 200 USD per day.",
  );
  assert.ok(!s.includes("$500"));
  assert.ok(!s.includes("200 USD"));
});

test("sanitizeInquiryDraftOutput strips guarantee and book-now language", () => {
  const s = sanitizeInquiryDraftOutput(
    "Book now — guaranteed availability tomorrow. 100% confirmed.",
  );
  assert.ok(!/book\s+now/i.test(s));
  assert.ok(!/guaranteed/i.test(s));
  assert.ok(!/100%\s*confirmed/i.test(s));
});

test("INQUIRY_DRAFT_MAX_CHARS is a reasonable bound", () => {
  assert.ok(INQUIRY_DRAFT_MAX_CHARS >= 1000 && INQUIRY_DRAFT_MAX_CHARS <= 8000);
});
