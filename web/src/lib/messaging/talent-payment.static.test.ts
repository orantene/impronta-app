import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

test("request payment uses the talent seller actor and still mints with the POS writer", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/messaging-engine.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function messagingRequestPayment"));
  const body = fn.slice(0, fn.indexOf("\nexport async function", 10));
  assert.match(body, /talentSellerPaymentActor\(parsed\.data\.inquiryId\)/);
  assert.match(body, /createPaymentLink\(g\.admin, \{[\s\S]*?inquiryId: parsed\.data\.inquiryId,[\s\S]*?\}\)/);
  const actor = readFileSync(join(process.cwd(), "src/lib/messaging/talent-payment-actor.ts"), "utf8");
  assert.match(actor, /talentPaymentRefusal/);
  assert.match(actor, /not_her_sale|fail\(refusal\)/);
});

test("approve and decline go through the roster writers and the inquiry tenant", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/server-actions/messaging-talent.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function messagingTalentDecide"));
  const body = fn.slice(0, fn.indexOf("\nexport async function", 10));
  assert.match(body, /acceptTalentInvitation\(gate\.actor\.supabase, ctx\)/);
  assert.match(body, /declineTalentInvitation\(gate\.actor\.supabase, ctx\)/);
  assert.match(body, /tenantId: gate\.row\.tenantId/);
  assert.doesNotMatch(body, /\.from\("inquiry_participants"\)\s*\.update/);
});

test("the talent inbox page mounts Messages v5, not a second shell", () => {
  const page = readFileSync(
    join(process.cwd(), "src/components/admin/shell/internal/talent/pages/messages/MessagesPage.tsx"),
    "utf8",
  );
  assert.match(page, /MessagesV5Shell/);
  assert.match(page, /talentShellEngine/);
  assert.match(page, /NEXT_PUBLIC_MESSAGES_V5/);
});
