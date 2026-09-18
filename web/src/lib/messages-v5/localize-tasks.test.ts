import assert from "node:assert/strict";
import { test } from "node:test";

import { deriveTasks } from "@/lib/messaging/tasks";
import { localizeTasks } from "./localize-tasks";

const copy = {
  reply: { title: "Responder al cliente", why: "El cliente espera una respuesta." },
  payment_issue_expired: { title: "Problema de pago", why: "El enlace caducó." },
  confirm_talent: { title: "Confirmar con el talento", why: "{count} pendientes." },
  closedLost: { title: "Perdida", why: "Marcada como perdida." },
};

const base = { conversationState: "awaiting_customer" as const, opportunityState: null, recordChips: [], identityLevel: "confirmed" as const, unanswered: false, talentConfirmationsPending: 0, balanceDueAt: null, reminderDueAt: null, holdExpiresAt: null, paymentIssue: null, now: "2026-09-18T00:00:00Z" };

test("tasks are translated by key and sentence variant; unknown keys keep the engine's words", () => {
  const tasks = localizeTasks(deriveTasks({ ...base, unanswered: true, paymentIssue: "expired", talentConfirmationsPending: 2 }), copy);
  const by = Object.fromEntries(tasks.map((t) => [t.key, t]));
  assert.equal(by.payment_issue.why, "El enlace caducó.");
  assert.equal(by.reply.title, "Responder al cliente");
  assert.equal(by.confirm_talent.why, "2 pendientes.");
  assert.equal(localizeTasks(deriveTasks({ ...base, opportunityState: "lost" }), copy)[0].title, "Perdida");
  assert.equal(localizeTasks(deriveTasks(base), copy)[0].title, "Nothing to do");
});
