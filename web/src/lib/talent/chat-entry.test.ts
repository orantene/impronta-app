import assert from "node:assert/strict";
import test from "node:test";

import {
  askEntryPointsVisible,
  dockMounted,
  intakeNoticeCopy,
  intakeNoticeKind,
  resolveTalentAskEntry,
  resolveTalentChatGreeting,
  type TalentAskEntry,
} from "./chat-entry";
import { parseTalentSiteSwitches } from "./site-switches";

const sw = (chatEnabled: boolean, acceptingInquiries: boolean, acceptingBookings: boolean) => ({
  chatEnabled,
  acceptingInquiries,
  acceptingBookings,
});

test("full matrix, no verified thread (report §8)", () => {
  // [chat, inquiries, bookings] -> entry
  const cases: [boolean, boolean, boolean, TalentAskEntry][] = [
    [true, true, true, "chat"],
    [true, true, false, "chat"],
    [false, true, true, "form"],
    [false, true, false, "form"],
    [true, false, true, "closed_notice"], // no composer, confirmation-email link
    [false, false, true, "hidden"],
    [true, false, false, "unavailable"], // both off: honest, never Consultar
    [false, false, false, "unavailable"],
  ];
  for (const [c, i, b, want] of cases) {
    assert.equal(resolveTalentAskEntry(sw(c, i, b)), want, `chat=${c} inq=${i} book=${b}`);
  }
});

test("a verified active thread keeps a reply dock under every switch", () => {
  for (const c of [true, false])
    for (const i of [true, false])
      for (const b of [true, false]) {
        const entry = resolveTalentAskEntry(sw(c, i, b), { hasActiveThread: true });
        assert.ok(dockMounted(entry), `chat=${c} inq=${i} book=${b}`);
        assert.equal(intakeNoticeKind(entry), null);
        // Only a fully open talent shows new-conversation entry points.
        assert.equal(askEntryPointsVisible(entry), c && i);
      }
});

test("closed/unavailable never mount the dock nor show Ask", () => {
  for (const e of ["closed_notice", "unavailable", "hidden"] as const) {
    assert.equal(dockMounted(e), false);
    assert.equal(askEntryPointsVisible(e), false);
  }
  assert.equal(intakeNoticeKind("closed_notice"), "closed");
  assert.equal(intakeNoticeKind("unavailable"), "unavailable");
  assert.equal(intakeNoticeKind("hidden"), null);
  assert.equal(askEntryPointsVisible("form"), true);
  assert.equal(dockMounted("form"), false);
});

test("notice copy, EN + ES tú, no em dash", () => {
  assert.equal(
    intakeNoticeCopy("closed", "en"),
    "This talent isn't taking new messages. If you have a booking, use the link in your confirmation email.",
  );
  assert.match(intakeNoticeCopy("closed", "es"), /Si tienes una reserva, usa el enlace/);
  assert.match(intakeNoticeCopy("unavailable", "es"), /no está disponible/);
  for (const k of ["closed", "unavailable"] as const)
    for (const l of ["en", "es"]) assert.doesNotMatch(intakeNoticeCopy(k, l), /—/);
});

test("a talent with no talent_sites row gets the chat", () => {
  assert.equal(resolveTalentAskEntry(parseTalentSiteSwitches(null)), "chat");
});

test("greeting: her own greeting wins, else the default", () => {
  const own = parseTalentSiteSwitches({ chat_config: { greeting: "  Hola, cuéntame  " } });
  assert.equal(resolveTalentChatGreeting(own, "Trade voice"), "Hola, cuéntame");
  const none = parseTalentSiteSwitches({ chat_config: { greeting: "   " } });
  assert.equal(resolveTalentChatGreeting(none, "Trade voice"), "Trade voice");
  assert.equal(resolveTalentChatGreeting(parseTalentSiteSwitches(null), null), null);
});
