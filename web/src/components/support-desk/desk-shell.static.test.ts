import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("hqReopenTicketAction wraps supportEngine.reopenTicket", () => {
  const src = readFileSync("src/lib/support/hq-actions.ts", "utf8");
  assert.match(src, /export async function hqReopenTicketAction/);
  assert.match(src, /supportEngine\.reopenTicket/);
});

test("Desk shell wires reply, note, resolve, reopen", () => {
  const src = readFileSync("src/components/support-desk/DeskShell.tsx", "utf8");
  assert.match(src, /hqReplySupportTicketAction/);
  assert.match(src, /asInternalNote/);
  assert.match(src, /hqChangeStatusAction/);
  assert.match(src, /hqReopenTicketAction/);
  assert.match(src, /status: "resolved"/);
});

test("Desk routes exist for support host and local QA", () => {
  const desk = readFileSync("src/app/(desk)/desk/page.tsx", "utf8");
  const local = readFileSync(
    "src/app/(workspace)/platform/admin/support/desk/page.tsx",
    "utf8",
  );
  assert.match(desk, /DeskShell/);
  assert.match(local, /DeskShell/);
  assert.match(local, /basePath=\"\/platform\/admin\/support\/desk\"/);
});
