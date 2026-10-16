import assert from "node:assert/strict";
import { test } from "node:test";

import { filterQaFixtureInboxRows, isQaFixtureInboxRow, readQaFixtureMarker, talentKeepsFixtureThreads } from "./qa-fixture-row";

function row(partial: {
  contactName?: string;
  contactEmail?: string | null;
  subject?: string;
  lastMessagePreview?: string;
  unread?: boolean;
}) {
  return {
    contactName: partial.contactName ?? "Sofía",
    contactEmail: partial.contactEmail ?? "sofia@gmail.com",
    subject: partial.subject ?? "Hola",
    lastMessagePreview: partial.lastMessagePreview ?? "¿Tienes lugar?",
    unread: partial.unread ?? false,
  };
}

test("keeps a real client email and name", () => {
  assert.equal(isQaFixtureInboxRow(row({})), false);
});

test("hides a row only when it carries the explicit qa_fixture marker", () => {
  assert.equal(isQaFixtureInboxRow({ ...row({ contactName: "Real Client" }), qaFixture: true }), true);
  assert.equal(isQaFixtureInboxRow({ ...row({}), qaFixture: false }), false);
});

test("TUL-622: real clients are never hidden by name, email or body text", () => {
  assert.equal(isQaFixtureInboxRow(row({ contactName: "QA Solutions SA", contactEmail: "ops@qasolutions.mx" })), false);
  assert.equal(isQaFixtureInboxRow(row({ contactName: "Quentin", contactEmail: "ana@example.com" })), false);
  assert.equal(isQaFixtureInboxRow(row({ contactName: "Client", contactEmail: "bozo-guest+s4@gmail.com" })), false);
  assert.equal(isQaFixtureInboxRow(row({ lastMessagePreview: "Please ignore my earlier date, use 5 June" })), false);
  assert.equal(isQaFixtureInboxRow(row({ subject: "QA test of my makeup" })), false);
});

test("transition fallback: @impronta.test emails stay hidden until the backfill lands", () => {
  assert.equal(isQaFixtureInboxRow(row({ contactEmail: "qa-pathb@impronta.test", contactName: "Guest" })), true);
});

test("filterQaFixtureInboxRows drops fixtures and recounts unread", () => {
  const out = filterQaFixtureInboxRows([
    row({ contactName: "Sofía", unread: true }),
    row({ contactName: "QA Guest", contactEmail: "qa@impronta.test", unread: true }),
    { ...row({ contactName: "Marked", unread: false }), qaFixture: true },
  ]);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0]?.contactName, "Sofía");
  assert.equal(out.unreadCount, 1);
});

test("QA accounts and demo talents keep fixture threads; a real talent does not", () => {
  assert.equal(talentKeepsFixtureThreads({ isDemo: false, displayName: "QA Fixture — Max Talent" }), true);
  assert.equal(talentKeepsFixtureThreads({ isDemo: false, displayName: "QA Grok Salon" }), true);
  assert.equal(talentKeepsFixtureThreads({ isDemo: true, displayName: "Valeria" }), true);
  assert.equal(talentKeepsFixtureThreads({ isDemo: false, displayName: "Diego Pestañas" }), false);
  assert.equal(talentKeepsFixtureThreads({ isDemo: false, displayName: null }), false);
  assert.equal(talentKeepsFixtureThreads({ isDemo: false, displayName: "Qatar Dance" }), false);
});

test("readQaFixtureMarker accepts only an explicit boolean true on an object", () => {
  assert.equal(readQaFixtureMarker({ qa_fixture: true }), true);
  assert.equal(readQaFixtureMarker({ qa_fixture: "true" }), false);
  assert.equal(readQaFixtureMarker({ qa_cash_cycle: true }), false);
  assert.equal(readQaFixtureMarker(null), false);
  assert.equal(readQaFixtureMarker([true]), false);
});
