import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { rateLimited } from "@/lib/support/rate-limit-result";
import { supportSendErrorText } from "./support-send-error";

type Dict = Record<string, unknown>;

function makeT(locale: "en" | "es") {
  const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8")) as Dict;
  return (key: string): string => {
    let node: unknown = messages;
    for (const part of key.split(".")) node = (node as Dict | undefined)?.[part];
    return typeof node === "string" ? node : key;
  };
}

test("a rate-limit verdict becomes a rate_limited failure with whole seconds", async () => {
  const r = await rateLimited(Promise.resolve({ ok: false, code: "rate_limited", retryAfterMs: 90_500 }));
  assert.ok(r);
  assert.equal(r.code, "rate_limited");
  assert.equal(r.retryAfterSec, 91);
});

test("an allowed verdict is not a failure", async () => {
  assert.equal(await rateLimited(Promise.resolve({ ok: true })), null);
});

test("retryAfterSec is never below one second", async () => {
  const r = await rateLimited(Promise.resolve({ ok: false, code: "rate_limited", retryAfterMs: 0 }));
  assert.equal(r?.retryAfterSec, 1);
});

test("rate-limited failures say so, with minutes, in EN and ES", () => {
  const en = supportSendErrorText(makeT("en"), { code: "rate_limited", retryAfterSec: 1500 });
  assert.match(en, /sent a lot/);
  assert.match(en, /25 minutes/);
  const es = supportSendErrorText(makeT("es"), { code: "rate_limited", retryAfterSec: 1500 });
  assert.match(es, /Enviaste muchos/);
  assert.match(es, /25 minutos/);
});

test("under a minute uses the singular copy", () => {
  assert.match(supportSendErrorText(makeT("en"), { code: "rate_limited", retryAfterSec: 20 }), /about a minute/);
  assert.match(supportSendErrorText(makeT("es"), { code: "rate_limited", retryAfterSec: 20 }), /en un minuto/);
});

test("any other failure keeps the generic did-not-send line", () => {
  const en = makeT("en");
  assert.equal(supportSendErrorText(en, { }), en("dashboard.adminSupport.sendFailed"));
  assert.equal(supportSendErrorText(en, null), en("dashboard.adminSupport.sendFailed"));
  assert.match(supportSendErrorText(makeT("es"), undefined), /No se pudo enviar/);
});

test("copy has no em dashes", () => {
  for (const l of ["en", "es"] as const) {
    const t = makeT(l);
    for (const k of ["rateLimited", "rateLimitedOne"]) assert.ok(!t(`dashboard.adminSupport.${k}`).includes("—"));
  }
});
