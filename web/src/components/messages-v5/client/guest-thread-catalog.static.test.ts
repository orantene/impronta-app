/**
 * TUL-693 / TUL-954 / TUL-1347: the guest thread (/c/t/[token]) rendered raw i18n
 * keys because the browser translator holds only CLIENT_MESSAGE_SUBTREES and
 * `dashboard.messagesV5.*` is not one of them. The server page now hands the
 * thread its own catalog bundle. This guard pins:
 *   1. every literal key the thread's copy builders read exists in en AND es;
 *   2. the bundle the page ships contains every one of those keys;
 *   3. the translator prefers the thread locale, then English, then the ambient one;
 *   4. the page and ClientThread are wired to it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import en from "../../../../messages/en.json";
import es from "../../../../messages/es.json";
import { clientThreadCatalog } from "@/lib/messaging/client-thread-catalog";

import { bundleTranslator } from "./bundle-translator";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), "utf8");

const SOURCES = [
  "copy.ts",
  "ClientThread.tsx",
  "../kit/copy.ts",
  "../kit/copy-engine-lines.ts",
  "../../../app/t/[profileCode]/_chat/GuestOfferSignIn.tsx",
];

function literalKeys(): string[] {
  const keys = new Set<string>();
  for (const rel of SOURCES) {
    for (const m of read(rel).matchAll(/\bt\(\s*["'`]((?:dashboard|public)\.[A-Za-z0-9_.]+)["'`]/g)) keys.add(m[1]);
  }
  return [...keys].sort();
}

function walk(root: unknown, key: string): unknown {
  let cur: unknown = root;
  for (const part of key.split(".")) {
    if (cur && typeof cur === "object" && part in (cur as object)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return cur;
}

test("the scan finds the thread's keys (not silently empty)", () => {
  const keys = literalKeys();
  assert.ok(keys.length > 150, `only ${keys.length} keys found`);
  assert.ok(keys.includes("dashboard.messagesV5.client.link.offerBanner.cta"));
  assert.ok(keys.includes("public.guestChat.signInToAccept"));
});

test("every key the guest thread reads exists in en.json and es.json", () => {
  const missing: string[] = [];
  for (const key of literalKeys()) {
    for (const [name, catalog] of [["en", en], ["es", es]] as const) {
      if (typeof walk(catalog, key) !== "string") missing.push(`${name}: ${key}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("the offer card keys the QA retest saw raw are in both catalogs", () => {
  for (const leaf of ["title", "unitsSuffix", "total", "validUntil", "askChange", "decline"]) {
    for (const catalog of [en, es]) assert.equal(typeof walk(catalog, `dashboard.messagesV5.client.link.offer.${leaf}`), "string", leaf);
  }
});

test("the catalog bundle for a locale answers every key, with English as the fallback", () => {
  for (const locale of ["es", "es-MX", "en"]) {
    const bundle = clientThreadCatalog(locale);
    const t = bundleTranslator(bundle, locale, (k) => `RAW:${k}`);
    for (const key of literalKeys()) assert.ok(!t(key).startsWith("RAW:"), `${locale}: ${key}`);
  }
  const t = bundleTranslator(clientThreadCatalog("es"), "es", (k) => k);
  assert.equal(t("dashboard.messagesV5.client.link.offerBanner.cta"), walk(es, "dashboard.messagesV5.client.link.offerBanner.cta"));
  assert.notEqual(t("public.guestChat.signInToAccept"), walk(en, "public.guestChat.signInToAccept"));
});

test("translator order: thread locale, then English, then the ambient translator", () => {
  const catalog = { es: { a: { b: "hola" } }, en: { a: { b: "hello", c: "only en" } } };
  const t = bundleTranslator(catalog, "es-MX", (k) => `ambient:${k}`);
  assert.equal(t("a.b"), "hola");
  assert.equal(t("a.c"), "only en");
  assert.equal(t("a.zzz"), "ambient:a.zzz");
  assert.equal(bundleTranslator(undefined, "es", (k) => `ambient:${k}`)("a.b"), "ambient:a.b");
});

test("the page ships the catalog and ClientThread reads it", () => {
  const page = read("../../../app/(public)/c/t/[token]/page.tsx");
  assert.match(page, /catalog=\{clientThreadCatalog\(locale\)\}/);
  const thread = read("ClientThread.tsx");
  assert.match(thread, /bundleTranslator\(props\.catalog, props\.locale, translatorFor\(props\.locale\)\)/);
});

test("the client stream localises the engine's English system lines", () => {
  const view = read("ClientThreadView.tsx");
  assert.equal((view.match(/localiseEngineLine\(/g) ?? []).length >= 2, true);
  assert.doesNotMatch(view, /text=\{(?:it\.)?message\.body \|\| copy\.generic\.message\}/);
});

test("TUL-1347: ticket and class rows carry the offering currency (no USD on an MXN tenant)", () => {
  const src = read("../../../lib/messages-v5/items-catalog.ts");
  assert.match(src, /\.select\("id, currency"\)/);
  assert.equal((src.match(/currency: offeringCurrency\.get\(s\.offering_id as string\) \?\? null/g) ?? []).length, 2);
});
