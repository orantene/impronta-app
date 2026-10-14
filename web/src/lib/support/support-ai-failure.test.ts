import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { supportAiErrorBody, SUPPORT_AI_ERROR_CARD } from "./support-ai-failure";

test("error copy offers retry or a human, in both languages, no em dash", () => {
  for (const l of ["en", "es"]) {
    const b = supportAiErrorBody(l);
    assert.ok(!b.includes("—"));
    assert.match(b, l === "es" ? /volver a enviar/ : /send your message again/);
  }
  assert.equal(SUPPORT_AI_ERROR_CARD.kind, "offer-human");
});

test("failOpen in both AI routes never escalates", () => {
  for (const f of ["support-chat", "guest-support-chat"]) {
    const src = readFileSync(`src/app/api/ai/${f}/route.ts`, "utf8");
    const body = src.slice(src.indexOf("async function failOpen"), src.indexOf("export async function POST"));
    assert.ok(!/escalateTicket/.test(body), `${f} failOpen must not escalate`);
  }
});

test("TUL-601 and TUL-661 copy exists in en/es without em dashes", () => {
  for (const l of ["en", "es"]) {
    const j = JSON.parse(readFileSync(`messages/${l}.json`, "utf8")).dashboard.adminSupport;
    assert.match(j.ticketReceipt, /#\{number\}/);
    assert.ok(!j.ticketReceipt.includes("—") && !j.humanHandling.includes("—"));
    assert.ok(j.humanHandling);
  }
});

test("guest failOpen posts the offer-human card; talk-to-a-person and email both escalate", () => {
  const route = readFileSync("src/app/api/ai/guest-support-chat/route.ts", "utf8");
  const fo = route.slice(route.indexOf("async function failOpen"), route.indexOf("export async function POST"));
  assert.match(fo, /SUPPORT_AI_ERROR_CARD/);
  assert.match(fo, /messageKind: "card"/);
  const actions = readFileSync("src/lib/support/guest-actions.ts", "utf8");
  const human = actions.slice(actions.indexOf("export async function requestGuestHumanAction"));
  assert.match(human.slice(0, 900), /escalateTicket/);
  const attach = actions.slice(actions.indexOf("export async function attachGuestContactAction"), actions.indexOf("export async function requestGuestHumanAction"));
  assert.match(attach, /ticketHadAiError[\s\S]*escalateTicket/);
});

test("TUL-601: ticket receipt shows while the AI still handles the ticket", () => {
  const src = readFileSync("src/components/support/SupportThreadHeader.tsx", "utf8");
  const aiBranch = src.slice(src.indexOf("adminSupport.aiHandling"));
  assert.match(aiBranch, /adminSupport\.ticketReceipt/);
  assert.match(aiBranch, /ticketNumber > 0/);
});
