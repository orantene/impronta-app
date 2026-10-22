import assert from "node:assert/strict";
import { test } from "node:test";

import { createTranslator } from "@/i18n/messages";
import { localizeAuditLine } from "./audit-line-i18n";

test("desk recent-activity lines are localized (es) and stay English in en", () => {
  const es = createTranslator("es");
  const en = createTranslator("en");
  assert.equal(localizeAuditLine(es, { action: "x", summary: "Opened support ticket #21" }), "Abrió el ticket de soporte #21");
  assert.equal(localizeAuditLine(es, { action: "x", summary: "Ticket #21 marked resolved" }), "Ticket #21 marcado como resuelto");
  assert.equal(localizeAuditLine(es, { action: "x", summary: "Ticket #22 escalated to a human" }), "Ticket #22 pasado a una persona");
  assert.equal(localizeAuditLine(en, { action: "x", summary: "Ticket #21 marked resolved" }), "Ticket #21 marked resolved");
  assert.equal(localizeAuditLine(es, { action: "other.thing", summary: "Something else" }), "Something else");
  assert.equal(localizeAuditLine(es, { action: "other.thing", summary: null }), "other.thing");
});
