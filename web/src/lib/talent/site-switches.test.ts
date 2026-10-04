import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_TALENT_SITE_SWITCHES, parseTalentSiteSwitches } from "./site-switches";

test("missing row reads as all-on", () => {
  assert.deepEqual(parseTalentSiteSwitches(null), DEFAULT_TALENT_SITE_SWITCHES);
  assert.deepEqual(parseTalentSiteSwitches({}), DEFAULT_TALENT_SITE_SWITCHES);
});

test("explicit false is kept; junk falls back to on", () => {
  const s = parseTalentSiteSwitches({
    accepting_bookings: false,
    accepting_inquiries: "no",
    chat_enabled: false,
    chat_config: { greeting: "  Hola  ", browseServices: false },
  });
  assert.equal(s.acceptingBookings, false);
  assert.equal(s.acceptingInquiries, true);
  assert.equal(s.chatEnabled, false);
  assert.deepEqual(s.chatConfig, { greeting: "Hola", browseServices: false });
});

test("greeting is capped and blank greeting is null", () => {
  assert.equal(parseTalentSiteSwitches({ chat_config: { greeting: "   " } }).chatConfig.greeting, null);
  assert.equal(parseTalentSiteSwitches({ chat_config: { greeting: "x".repeat(400) } }).chatConfig.greeting?.length, 280);
  assert.equal(parseTalentSiteSwitches({ chat_config: [] }).chatConfig.browseServices, true);
});
