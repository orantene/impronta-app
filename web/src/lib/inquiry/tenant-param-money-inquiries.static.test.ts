import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * TUL-1758 slice (money + inquiries): exported "use server" actions that take a client-chosen tenantSlug / tenantId.
 * Each one must re-resolve its scope from membership / ownership, never trust the argument. This pins the two that
 * needed a fix and the resolver each of the rest relies on, so a refactor that drops the resolver fails here.
 */
const src = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");
const fnBody = (code: string, name: string) => {
  const i = code.search(new RegExp(`export (?:async )?function ${name}\\b`));
  assert.ok(i >= 0, `${name} located`);
  const rest = code.slice(i + 10);
  const next = rest.search(/\nexport (?:async )?function /);
  return next < 0 ? rest : rest.slice(0, next);
};

test("placeTalentHold: the talent and the inquiry must belong to the membership-resolved tenant", () => {
  const body = fnBody(src("lib/talent-calendar/hold-actions.ts"), "placeTalentHold");
  assert.match(body, /requireWorkspaceStaffAction\(\{ capability: "agency\.roster\.edit" \}\)/);
  assert.match(body, /\.from\("agency_talent_roster"\)[\s\S]*\.eq\("tenant_id", tenantId\)[\s\S]*\.eq\("talent_profile_id", input\.talentProfileId\)[\s\S]*\.eq\("status", "active"\)/);
  assert.match(body, /assertRowBelongsToTenant\(supabase, "inquiries", input\.inquiryId, tenantId\)/);
  assert.ok(body.indexOf("agency_talent_roster") < body.indexOf('.from("talent_holds")'), "ownership is proven before the insert");
});

test("submitDraftAction: the service-role submit only runs for the caller's own draft in this workspace", () => {
  const body = fnBody(src("app/(workspace)/[tenantSlug]/client/_actions/inquiry-intent-actions.ts"), "submitDraftAction");
  assert.match(body, /loadInquiryDraft\(ctx\.supabase, draftId\)/, "loaded with the caller's own session, not the service client");
  assert.match(body, /requester_user_id !== ctx\.actorUserId/);
  assert.match(body, /tenant_id !== ctx\.tenantId/);
  assert.ok(body.indexOf("loadInquiryDraft") < body.indexOf("submitInquiryDraft(ctx.writeClient"), "ownership check precedes the submit");
});

test("saveInquiryDraft: an update is limited to the requester's own row", () => {
  const body = fnBody(src("lib/inquiry/inquiry-intent-engine.ts"), "saveInquiryDraft");
  assert.match(body, /\.eq\("tenant_id", ctx\.tenant_id\)\s*\.eq\("requester_user_id", ctx\.requester_user_id\)/);
});

test("the rest of the slice re-resolves scope through membership or ownership", () => {
  const pipeline = src("app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts");
  // markInquiryPaidInCash: scope + capability from the inquiry's tenant, the tenantSlug argument is never used for scope.
  assert.match(fnBody(pipeline, "markInquiryPaidInCash"), /withInquiryBooking<void>\(inquiryId[\s\S]*capability: WRITE_CAP\.markInquiryPaidInCash/);
  assert.match(pipeline, /async function withInquiryBooking[\s\S]*requireInquiryManagerAction\(inquiryId, options\)/);
  const attach = src("app/(workspace)/[tenantSlug]/admin/_pipeline-attachment-actions.ts");
  assert.match(fnBody(attach, "loadInquiryAttachments"), /requireInquiryManagerAction\(inquiryId\)[\s\S]*\.eq\("tenant_id", tenantId\)/);
  assert.match(fnBody(attach, "deleteInquiryAttachment"), /requireWorkspaceStaffAction\(\{ capability: WRITE_CAP\.deleteInquiryAttachment \}\)[\s\S]*\.eq\("tenant_id", tenantId\)/);

  const intent = src("app/(workspace)/[tenantSlug]/client/_actions/inquiry-intent-actions.ts");
  assert.match(intent, /async function assertInquirySubmitter[\s\S]*\.eq\("tenant_id", ctx\.tenantId\)[\s\S]*client_user_id[\s\S]*guest_session_id/);
  assert.match(fnBody(intent, "createInquiryAttachmentUploadUrlAction"), /assertInquirySubmitter\(ctx, input\.inquiryId\)/);
  assert.match(fnBody(intent, "registerInquiryAttachmentAction"), /assertInquirySubmitter\(ctx, input\.inquiryId\)/);

  const msg = src("app/(workspace)/[tenantSlug]/client/_actions/inquiry-message-actions.ts");
  assert.match(fnBody(msg, "sendClientMessageAction"), /\.eq\("client_user_id", session\.user\.id\)/);

  const inbox = src("app/(workspace)/[tenantSlug]/talent/inbox/[id]/actions.ts");
  assert.match(inbox, /async function resolveParticipant[\s\S]*loadTalentSelfProfile\(user\.id, scope\.tenantId\)[\s\S]*\.eq\("talent_profile_id", talent\.id\)/);

  const plan = src("app/(workspace)/[tenantSlug]/talent/settings/plan-change-actions.ts");
  assert.match(plan, /async function ownTalentProfileId[\s\S]*loadTalentSelfProfile\(session\.user\.id, scope\.tenantId\)/);

  const purchasePolicy = src("lib/orders/purchase-policy.ts");
  assert.match(purchasePolicy, /policy\.tenantId !== intent\.tenantId/, "submitMenuOrder's tenantId is checked against every offering");
});
