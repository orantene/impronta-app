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
  assert.deepEqual(s.chatConfig, {
    greeting: "Hola",
    browseServices: false,
    aiBookingAssistantEnabled: false,
    agentBookingEnabled: false,
    clientAccountEntry: "auto",
  });
});

test("greeting is capped and blank greeting is null", () => {
  assert.equal(parseTalentSiteSwitches({ chat_config: { greeting: "   " } }).chatConfig.greeting, null);
  assert.equal(parseTalentSiteSwitches({ chat_config: { greeting: "x".repeat(400) } }).chatConfig.greeting?.length, 280);
  assert.equal(parseTalentSiteSwitches({ chat_config: [] }).chatConfig.browseServices, true);
});

test("ai booking assistant defaults off; only explicit true enables", () => {
  assert.equal(
    parseTalentSiteSwitches({ chat_config: {} }).chatConfig.aiBookingAssistantEnabled,
    false,
  );
  assert.equal(
    parseTalentSiteSwitches({ chat_config: { aiBookingAssistantEnabled: true } }).chatConfig
      .aiBookingAssistantEnabled,
    true,
  );
  assert.equal(
    parseTalentSiteSwitches({ chat_config: { aiBookingAssistantEnabled: "yes" } }).chatConfig
      .aiBookingAssistantEnabled,
    false,
  );
});

test("AI-agent booking (TUL-21) defaults off; only explicit true enables", () => {
  assert.equal(parseTalentSiteSwitches(null).chatConfig.agentBookingEnabled, false);
  assert.equal(parseTalentSiteSwitches({ chat_config: {} }).chatConfig.agentBookingEnabled, false);
  assert.equal(
    parseTalentSiteSwitches({ chat_config: { agentBookingEnabled: true } }).chatConfig.agentBookingEnabled,
    true,
  );
  assert.equal(
    parseTalentSiteSwitches({ chat_config: { agentBookingEnabled: 1 } }).chatConfig.agentBookingEnabled,
    false,
  );
});

test("client account entry defaults to auto; only show / hide are kept", () => {
  assert.equal(parseTalentSiteSwitches({ chat_config: {} }).chatConfig.clientAccountEntry, "auto");
  assert.equal(parseTalentSiteSwitches({ chat_config: { clientAccountEntry: "hide" } }).chatConfig.clientAccountEntry, "hide");
  assert.equal(parseTalentSiteSwitches({ chat_config: { clientAccountEntry: "show" } }).chatConfig.clientAccountEntry, "show");
  assert.equal(parseTalentSiteSwitches({ chat_config: { clientAccountEntry: "nope" } }).chatConfig.clientAccountEntry, "auto");
  assert.equal(parseTalentSiteSwitches(null).chatConfig.clientAccountEntry, "auto");
});
