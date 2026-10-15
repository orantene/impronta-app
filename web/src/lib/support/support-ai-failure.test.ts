import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  shouldOfferHumanInsteadOfEscalating,
  supportAiErrorBody,
  supportAiErrorCard,
  SUPPORT_AI_ERROR_CARD,
} from "./support-ai-failure";

test("error copy offers retry or a human, in both languages, no em dash", () => {
  for (const l of ["en", "es"]) {
    const b = supportAiErrorBody(l);
    assert.ok(!b.includes("—"));
    assert.match(b, l === "es" ? /volver a enviar/ : /send your message again/);
  }
  assert.equal(SUPPORT_AI_ERROR_CARD.kind, "offer-human");
  assert.equal(supportAiErrorCard("es").description, supportAiErrorBody("es"));
});

test("failOpen in both AI routes never escalates", () => {
  for (const f of ["support-chat", "guest-support-chat"]) {
    const src = readFileSync(`src/app/api/ai/${f}/route.ts`, "utf8");
    const body = src.slice(src.indexOf("async function failOpen"), src.indexOf("export async function POST"));
    assert.ok(!/escalateTicket/.test(body), `${f} failOpen must not escalate`);
    assert.match(body, /supportAiErrorCard/);
    assert.match(body, /messageKind: "card"/);
  }
});

test("guest: talk-to-a-person and leaving an email both escalate (the guest asked)", () => {
  const actions = readFileSync("src/lib/support/guest-actions.ts", "utf8");
  const human = actions.slice(actions.indexOf("export async function requestGuestHumanAction"));
  assert.match(human.slice(0, 900), /escalateTicket/);
  const attach = actions.slice(
    actions.indexOf("export async function attachGuestContactAction"),
    actions.indexOf("export async function requestGuestHumanAction"),
  );
  assert.match(attach, /ticketHadAiError[\s\S]*escalateTicket/);
});

test("TUL-660: AI-raised reasons only offer a person; deadline-bound reasons still escalate", () => {
  for (const r of ["ai_low_confidence", "ai_sentiment", "ai_suggested", "billing", "refund"]) {
    assert.equal(shouldOfferHumanInsteadOfEscalating(r), true, r);
  }
  for (const r of ["dispute", "safety", "legal", "", "unknown_reason"]) {
    assert.equal(shouldOfferHumanInsteadOfEscalating(r), false, r);
  }
});

test("TUL-660: both AI routes consult the offer-first rule before escalating", () => {
  for (const f of ["support-chat", "guest-support-chat"]) {
    const src = readFileSync(`src/app/api/ai/${f}/route.ts`, "utf8");
    assert.match(src, /shouldOfferHumanInsteadOfEscalating\(/, f);
  }
});
