/**
 * TUL-225 Phase 1 PR 2: the WhatsApp provider seam and its Twilio adapter. Nothing here sends a
 * real message: every Twilio call goes through an injected fake.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { sendWhatsAppNotification } from "../channels/whatsapp";
import { isStatusAdvance, whatsappAddress, type WhatsAppProvider } from "./provider";
import { createTwilioWhatsAppProvider, twilioWhatsAppConfigFromEnv } from "./twilio";

const CONFIG = { accountSid: "AC_test", authToken: "token_test", from: "whatsapp:+14155550100" };
const TEMPLATE = "HX0123456789abcdef0123456789abcdef";

function fakeTwilio() {
  const calls: Array<Record<string, unknown>> = [];
  const provider = createTwilioWhatsAppProvider(CONFIG, {
    createMessage: async (input) => {
      calls.push(input);
      return { sid: `SM${calls.length}` };
    },
    validateRequest: (token, signature, url, params) => token === CONFIG.authToken && signature === "good" && url === "https://x.test/cb" && params.MessageSid === "SM1",
  });
  return { provider, calls };
}

test("whatsappAddress: E.164 gets the whatsapp: prefix once; anything else is refused", () => {
  assert.equal(whatsappAddress("+5219981234567"), "whatsapp:+5219981234567");
  assert.equal(whatsappAddress(" whatsapp:+14155550100 "), "whatsapp:+14155550100");
  assert.equal(whatsappAddress("9981234567"), null);
  assert.equal(whatsappAddress("+52 998 123 4567"), null);
  assert.equal(whatsappAddress(""), null);
});

test("sendTemplate sends the Content SID with its variables as JSON to the prefixed number", async () => {
  const { provider, calls } = fakeTwilio();
  const sent = await provider.sendTemplate({ to: "+5219981234567", templateId: TEMPLATE, variables: { "1": "Valeria", "2": "tu sitio web" }, statusCallbackUrl: "https://x.test/cb" });
  assert.deepEqual(sent, { ok: true, providerReference: "SM1" });
  assert.deepEqual(calls[0], {
    from: CONFIG.from,
    to: "whatsapp:+5219981234567",
    contentSid: TEMPLATE,
    contentVariables: JSON.stringify({ "1": "Valeria", "2": "tu sitio web" }),
    statusCallback: "https://x.test/cb",
  });
  assert.equal("body" in calls[0], false, "a template send carries no free text");
});

test("sendTemplate refuses a bad number or a non-Content-SID template without calling Twilio", async () => {
  const { provider, calls } = fakeTwilio();
  assert.deepEqual(await provider.sendTemplate({ to: "998123", templateId: TEMPLATE, variables: {} }), { ok: false, reason: "invalid_input" });
  assert.deepEqual(await provider.sendTemplate({ to: "+5219981234567", templateId: "new_inquiry_es", variables: {} }), { ok: false, reason: "invalid_input" });
  assert.equal(calls.length, 0);
});

test("parseStatus maps Twilio states to ours; a body with no sid or an unknown state is not a status", () => {
  const { provider } = fakeTwilio();
  assert.deepEqual(provider.parseStatus({ MessageSid: "SM9", MessageStatus: "undelivered", ErrorCode: "63016", To: "whatsapp:+5219981234567" }), {
    providerReference: "SM9",
    status: "failed",
    errorCode: "63016",
    to: "whatsapp:+5219981234567",
  });
  assert.equal(provider.parseStatus({ MessageSid: "SM9", MessageStatus: "read" })?.status, "read");
  assert.equal(provider.parseStatus({ MessageSid: "SM9", MessageStatus: "sending" })?.status, "queued");
  assert.equal(provider.parseStatus({ MessageStatus: "delivered" }), null);
  assert.equal(provider.parseStatus({ MessageSid: "SM9", MessageStatus: "mystery" }), null);
});

test("verifySignature: no signature is false; otherwise the provider check decides", async () => {
  const { provider } = fakeTwilio();
  assert.equal(await provider.verifySignature({ url: "https://x.test/cb", signature: null, params: { MessageSid: "SM1" } }), false);
  assert.equal(await provider.verifySignature({ url: "https://x.test/cb", signature: "bad", params: { MessageSid: "SM1" } }), false);
  assert.equal(await provider.verifySignature({ url: "https://x.test/cb", signature: "good", params: { MessageSid: "SM1" } }), true);
});

test("isStatusAdvance: statuses only move forward and failed is final", () => {
  assert.equal(isStatusAdvance(null, "queued"), true);
  assert.equal(isStatusAdvance("sent", "delivered"), true);
  assert.equal(isStatusAdvance("read", "delivered"), false);
  assert.equal(isStatusAdvance("delivered", "delivered"), false);
  assert.equal(isStatusAdvance("delivered", "failed"), true);
  assert.equal(isStatusAdvance("failed", "read"), false);
});

test("config comes from the owner alert's existing env and is null when any value is missing", () => {
  assert.deepEqual(twilioWhatsAppConfigFromEnv({ TWILIO_ACCOUNT_SID: " AC1 ", TWILIO_AUTH_TOKEN: "t", TWILIO_WHATSAPP_FROM: "whatsapp:+1" }), { accountSid: "AC1", authToken: "t", from: "whatsapp:+1" });
  assert.equal(twilioWhatsAppConfigFromEnv({ TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t" }), null);
});

/* ---------- owner alert regression: same body, same number, same dedupe ---------- */

function ownerFake(fail = false) {
  const sent: Array<{ to: string; body: string }> = [];
  const provider = {
    name: "twilio",
    sendText: async (input: { to: string; body: string }) => {
      if (fail) throw new Error("twilio 500");
      sent.push(input);
      return { ok: true as const, providerReference: `SM${sent.length}` };
    },
  } as unknown as WhatsAppProvider;
  return { owner: { provider, to: "whatsapp:+5219980000000" }, sent };
}

const entry = { whatsapp: { render: () => "  Support ticket escalated  " } } as never;
const recipient = {} as never;
const ctx = {} as never;
const event = (id: string) => ({ eventId: id }) as never;

test("owner alert: sends the trimmed body as free text to the owner number and returns the provider reference", async () => {
  const { owner, sent } = ownerFake();
  assert.equal(await sendWhatsAppNotification(event("ev-owner-1"), entry, recipient, ctx, { owner }), "SM1");
  assert.deepEqual(sent, [{ to: "whatsapp:+5219980000000", body: "Support ticket escalated" }]);
});

test("owner alert: one send per event id, no send when unconfigured, and a failed send is not deduped", async () => {
  const { owner, sent } = ownerFake();
  await sendWhatsAppNotification(event("ev-owner-2"), entry, recipient, ctx, { owner });
  assert.equal(await sendWhatsAppNotification(event("ev-owner-2"), entry, recipient, ctx, { owner }), null);
  assert.equal(sent.length, 1);

  assert.equal(await sendWhatsAppNotification(event("ev-owner-3"), entry, recipient, ctx, { owner: null }), null);
  assert.equal(await sendWhatsAppNotification(event("ev-owner-3"), { } as never, recipient, ctx, { owner }), null, "an entry with no whatsapp block sends nothing");

  const failing = ownerFake(true);
  await assert.rejects(sendWhatsAppNotification(event("ev-owner-4"), entry, recipient, ctx, { owner: failing.owner }));
  assert.equal(await sendWhatsAppNotification(event("ev-owner-4"), entry, recipient, ctx, { owner }), "SM2", "the retry after a failure still sends");
});

/* ---------- only the adapter may import a provider SDK ---------- */

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(p);
  }
  return out;
}

test("no file outside the WhatsApp adapter imports the twilio SDK", () => {
  const offenders = walk("src").filter((f) => {
    if (f.startsWith(join("src", "lib", "notifications", "whatsapp"))) return false;
    return /from\s+["']twilio["']|import\(\s*["']twilio["']\s*\)|require\(\s*["']twilio["']\s*\)/.test(readFileSync(f, "utf8"));
  });
  assert.deepEqual(offenders, []);
});
