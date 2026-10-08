import assert from "node:assert/strict";
import { test } from "node:test";

import { filterQaFixtureInboxRows } from "@/lib/messages-v5/qa-fixture-row";
import { countAwaitingReply, rowsForSellerFilter, sellerFilterCounts } from "@/lib/messages-v5/inbox-view";
import type { InboxRow } from "@/lib/messaging/types";

const row = (over: Partial<InboxRow>): InboxRow =>
  ({
    id: "x", contactName: "Ana", contactEmail: "ana@gmail.com", subject: "Hola", lastMessagePreview: "Hola",
    conversationState: "needs_reply", recordChips: [], unread: true, ...over,
  }) as InboxRow;

test("the real Extensiones thread (contact \"To\") is not dropped as QA clutter", () => {
  const real = row({ id: "r", contactName: "To", contactEmail: "orantenemx@gmail.com", subject: "Consulta sobre Extensiones clásicas · Martes 29 de sep, 12:00 (700 MXN) —" });
  const fixture = row({ id: "f", contactName: "QA Guest", contactEmail: "qa-x@impronta.test" });
  const kept = filterQaFixtureInboxRows([real, fixture]).rows.map((r) => r.id);
  assert.deepEqual(kept, ["r"]);
});

test("list length equals the needs-reply/badge universe: one rule", () => {
  const listed = filterQaFixtureInboxRows([
    row({ id: "a", contactName: "To", contactEmail: "orantenemx@gmail.com" }),
    row({ id: "b", contactName: "Maria", contactEmail: "maria@gmail.com", conversationState: "needs_reply" }),
    row({ id: "q", contactName: "Bozo Guest", contactEmail: "bozo-guest@impronta.test" }),
  ]).rows;
  assert.equal(listed.length, 2);
  assert.equal(sellerFilterCounts(listed).all, listed.length);
  assert.equal(countAwaitingReply(listed), rowsForSellerFilter(listed, "needs").length);
  assert.equal(countAwaitingReply(listed), 2);
});
