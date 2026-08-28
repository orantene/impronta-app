import assert from "node:assert/strict";
import { test } from "node:test";

import { parseInvestigationFindings, renderInvestigationMarkdown } from "./bundle";
import type { SupportMessageRow, SupportTicketRow } from "../support-types";

const ticket = {
  ticketNumber: 1001,
  surface: "workspace",
  category: "General",
  status: "open",
  priority: "high",
  handledBy: "human",
  rootCause: null,
  longTermFix: null,
} as SupportTicketRow;

const messages = [
  {
    authorKind: "requester",
    messageKind: "text",
    body: "Ping me at ada@example.com or +1 555 0100 1234",
    createdAt: "2026-08-01T00:00:00.000Z",
  },
] as SupportMessageRow[];

test("renderInvestigationMarkdown redacts emails and phones with stable hashes", () => {
  const md = renderInvestigationMarkdown({
    ticket,
    messages,
    tenantSlug: "impronta",
    diagnostics: null,
    auditEvents: [],
  });
  assert.equal(md.includes("ada@example.com"), false);
  assert.equal(md.includes("555 0100"), false);
  assert.match(md, /\[email:h[0-9a-f]{8}\]/);
  assert.match(md, /\[phone:h[0-9a-f]{8}\]/);
  assert.match(md, /ticket: INV-1001/);
});

test("parseInvestigationFindings reads Findings and Long-term fix", () => {
  const md = [
    "## Findings",
    "Race in save.",
    "",
    "## Long-term fix",
    "Serialize the write path.",
    "",
  ].join("\n");
  const parsed = parseInvestigationFindings(md);
  assert.equal(parsed.rootCause, "Race in save.");
  assert.equal(parsed.longTermFix, "Serialize the write path.");
});
