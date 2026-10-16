/** TUL-641: a talent (coordinator) reply on the private thread must mirror to the guest. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const src = readFileSync(
  join(process.cwd(), "src/app/(workspace)/[tenantSlug]/talent/inbox/[id]/actions.ts"),
  "utf8",
);

test("sendTalentInquiryMessage calls maybeSendGuestReplyNudge for private-thread sends", () => {
  assert.match(src, /import \{ maybeSendGuestReplyNudge \} from "@\/lib\/inquiry\/guest-reply-nudge"/);
  assert.match(src, /if \(threadType === "private"\) \{\s*await maybeSendGuestReplyNudge\(\{/);
});
