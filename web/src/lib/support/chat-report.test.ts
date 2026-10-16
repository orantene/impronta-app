import assert from "node:assert/strict";
import { test } from "node:test";

import { buildChatReportTicket, CHAT_REPORT_NOTE_MAX } from "./chat-report";

const base = { inquiryId: "11111111-1111-4111-8111-111111111111", tenantId: "t-1", talentProfileCode: "TAL-1" };

test("TUL-645: the report ticket carries references only, never the chat text", () => {
  const t = buildChatReportTicket({ ...base, note: "They asked for my number" });
  assert.equal(t.metadata.source, "chat_report");
  assert.equal(t.metadata.inquiry_id, base.inquiryId);
  assert.equal(t.metadata.tenant_id, "t-1");
  assert.equal(t.metadata.talent_profile_code, "TAL-1");
  assert.deepEqual(Object.keys(t.metadata).sort(), ["inquiry_id", "locale", "source", "talent_profile_code", "tenant_id"]);
});

test("TUL-645: an empty note gets a default body, a long one is capped, Spanish is honored", () => {
  assert.match(buildChatReportTicket(base).body, /reported this conversation/);
  assert.match(buildChatReportTicket({ ...base, locale: "es" }).body, /reportó/);
  assert.equal(buildChatReportTicket({ ...base, note: "x".repeat(5000) }).body.length, CHAT_REPORT_NOTE_MAX);
  assert.equal(buildChatReportTicket({ ...base, locale: "es" }).subject, "Reporte desde un chat");
});

import { readFileSync } from "node:fs";
import { join } from "node:path";

test("TUL-645: the Report button is wired from the server mount down to the Details sheet", () => {
  const chat = "src/app/t/[profileCode]/_chat/";
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  assert.match(read(chat + "TalentProfileChatLauncherMount.tsx"), /onReportToSupport=\{reportGuestChatToSupportAction\}/);
  for (const f of ["TalentProfileChatLauncher.tsx", "MiniChatPanelColumn.tsx", "GuestDetailsControl.tsx"]) {
    assert.match(read(chat + f), /onReportToSupport=\{onReportToSupport\}/, f);
  }
  assert.match(read(chat + "GuestDetailsSheet.tsx"), /public\.guestChat\.reportCta/);
  // ownership is proven server-side; the ticket links the inquiry, it does not copy it
  const action = read("src/lib/support/guest-actions.ts");
  assert.match(action, /reportGuestChatToSupportAction/);
  assert.match(action, /row\?\.guest_session_id === ident\.guestSessionId/);
  assert.match(action, /checkGuestSupportCreateAbuse\(\{\s*honeypot: input\.honeypot/);
});
