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
