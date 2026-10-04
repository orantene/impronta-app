import assert from "node:assert/strict";
import { test } from "node:test";

import { filterQaFixtureInboxRows, isQaFixtureInboxRow } from "./qa-fixture-row";

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

test("hides impronta.test and example.com guests", () => {
  assert.equal(isQaFixtureInboxRow(row({ contactEmail: "qa-pathb@impronta.test", contactName: "Guest" })), true);
  assert.equal(isQaFixtureInboxRow(row({ contactEmail: "ana.fd.qa@example.com", contactName: "Ana" })), true);
});

test("hides QA-prefixed names and tip/bozo locals", () => {
  assert.equal(isQaFixtureInboxRow(row({ contactName: "QA PathB Guest", contactEmail: "a@gmail.com" })), true);
  assert.equal(isQaFixtureInboxRow(row({ contactName: "Client", contactEmail: "bozo-guest+s4@gmail.com" })), true);
});

test("hides bodies stamped with test instructions", () => {
  assert.equal(
    isQaFixtureInboxRow(
      row({
        contactName: "To",
        contactEmail: "friend@gmail.com",
        lastMessagePreview: "QA test D (please ignore): semi-permanent gel.",
      }),
    ),
    true,
  );
});

test("filterQaFixtureInboxRows drops fixtures and recounts unread", () => {
  const out = filterQaFixtureInboxRows([
    row({ contactName: "Sofía", unread: true }),
    row({ contactName: "QA Guest", contactEmail: "qa@impronta.test", unread: true }),
    row({ contactName: "Ana", contactEmail: "ana@example.com", unread: false }),
  ]);
  assert.equal(out.rows.length, 1);
  assert.equal(out.rows[0]?.contactName, "Sofía");
  assert.equal(out.unreadCount, 1);
});
