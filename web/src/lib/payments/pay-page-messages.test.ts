/**
 * TUL-1935: the client pay page showed raw keys (public.thread.pay, ...). The root layout
 * inlines the full catalog for ITS locale only and the other locales as just the keys the
 * first lacks, so a pay page rendered in a different locale resolved to the raw key. The
 * pay layout now merges the full public.thread subtree for the page locale.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import en from "../../../messages/en.json";
import es from "../../../messages/es.json";
import { getClientMessagesPayload } from "../../i18n/messages";
import { CLIENT_MESSAGES_GLOBAL, createTranslator, mergeClientMessages } from "../../i18n/messages.client";

const PAY_DIR = join(process.cwd(), "src/app/(public)/pay/[code]");
const read = (f: string) => readFileSync(join(PAY_DIR, f), "utf8");

const PAY_KEYS = [
  "public.thread.pay",
  "public.thread.payBy",
  "public.thread.linkValidUntil",
  "public.thread.keepSlotAppointment",
  "public.thread.fees.client_service_fee",
  "public.thread.fees.nonRefundable",
];

function lookup(cat: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((o, p) => (o && typeof o === "object" ? (o as Record<string, unknown>)[p] : undefined), cat);
}

test("TUL-1935: every pay-page key exists in en and es", () => {
  for (const key of PAY_KEYS) {
    assert.equal(typeof lookup(en, key), "string", `en ${key}`);
    assert.equal(typeof lookup(es, key), "string", `es ${key}`);
  }
});

test("TUL-1935: pay layout merges the page-locale public.thread subtree before CheckoutView", () => {
  const layout = read("layout.tsx");
  assert.match(layout, /getRequestLocale\(\)\) === "en" \? "en" : "es"/);
  assert.match(layout, /getClientMessagesPayload\(uiLocale\)/);
  assert.match(layout, /<PayClientMessages code=\{uiLocale\} thread=\{pub\?\.thread\} \/>/);
  assert.ok(layout.indexOf("<PayClientMessages") < layout.indexOf("{children}"));
  assert.match(read("PayClientMessages.tsx"), /mergeClientMessages\(/);
});

test("TUL-1935: browser translator resolves pay labels in a non-layout locale after the merge", () => {
  const g = globalThis as Record<string, unknown>;
  const hadWindow = "window" in g;
  const prevMsgs = g[CLIENT_MESSAGES_GLOBAL];
  try {
    // Root layout rendered for es: en carries only the keys es lacks, so pay labels are absent.
    g[CLIENT_MESSAGES_GLOBAL] = JSON.parse(JSON.stringify(getClientMessagesPayload("es")));
    g.window = g;
    const tEn = createTranslator("en");
    const inlined = g[CLIENT_MESSAGES_GLOBAL] as Record<string, Record<string, unknown>>;
    // The failing shape: the fallback locale carries no thread subtree at all.
    assert.equal(lookup(inlined.en, "public.thread"), undefined);
    assert.equal(tEn("public.thread.pay"), "public.thread.pay");

    const pub = getClientMessagesPayload("en").en.public as Record<string, unknown>;
    mergeClientMessages({ en: { public: { thread: pub.thread as Record<string, unknown> } } });
    for (const key of PAY_KEYS) {
      assert.equal(tEn(key), lookup(en, key), key);
    }
  } finally {
    if (!hadWindow) delete g.window;
    g[CLIENT_MESSAGES_GLOBAL] = prevMsgs;
  }
});
