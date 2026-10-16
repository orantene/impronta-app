import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const actions = readFileSync("src/lib/support/attachment-actions.ts", "utf8");
const upload = readFileSync("src/components/support/upload-support-attachment.ts", "utf8");
const button = readFileSync("src/components/support/SupportAttachButton.tsx", "utf8");

test("finalize returns the shared rate_limited failure, not hard-coded English", () => {
  assert.match(actions, /rateLimited\(checkSupportMessageSend/);
  assert.doesNotMatch(actions, /Too many requests/);
});

test("the upload helper passes the rate_limited code through to the button", () => {
  assert.match(upload, /code: failure\.code/);
  assert.match(upload, /retryAfterSec: failure\.retryAfterSec/);
});

test("the button words a rate limit with the localized copy, not the file-size hint", () => {
  assert.match(button, /code === "rate_limited"/);
  assert.match(button, /supportSendErrorText\(t, failed\)/);
});
