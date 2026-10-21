import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
  audienceKeys,
  canReceive,
  contactProperties,
  entryAppliesTo,
  normalizeLanguage,
  normalizeMarket,
  resendAudienceName,
  summarizeAudiences,
  type RecipientFacts,
} from "./audience";
import { buildLaunchEmail, buildProductUpdateEmail } from "./template";

const HERE = dirname(fileURLToPath(import.meta.url));

function r(over: Partial<RecipientFacts> = {}): RecipientFacts {
  return {
    email: "a@example.com",
    role: "talent",
    plan: "free",
    language: "es-MX",
    market: "mx",
    consentSource: "subscriber",
    marketingOptIn: true,
    unsubscribed: false,
    ...over,
  };
}

test("TUL-1397: service mail reaches everyone, newsletter only opted-in and not unsubscribed", () => {
  assert.equal(canReceive("service", r({ marketingOptIn: false, consentSource: "none" })), true);
  assert.equal(canReceive("service", r({ unsubscribed: true })), true);
  assert.equal(canReceive("newsletter", r()), true);
  assert.equal(canReceive("newsletter", r({ marketingOptIn: false })), false);
  assert.equal(canReceive("newsletter", r({ unsubscribed: true })), false);
  assert.equal(canReceive("newsletter", r({ consentSource: "none", marketingOptIn: true })), false);
  assert.equal(canReceive("service", r({ email: "not-an-email" })), false);
});

test("TUL-1397: audience keys cover role, plan, language and market", () => {
  assert.deepEqual(audienceKeys(r()), ["tulala-talent-es", "role:talent", "plan:free", "language:es", "market:MX"]);
  assert.equal(normalizeLanguage("en-US"), "en");
  assert.equal(normalizeLanguage(null), "es");
  assert.equal(normalizeMarket("Mexico"), "OTHER");
  assert.equal(resendAudienceName("client", "en"), "tulala-client-en");
  assert.deepEqual(contactProperties(r({ plan: "studio", market: "us", language: "en" })), {
    role: "talent",
    plan: "studio",
    language: "en",
    market: "US",
  });
});

test("TUL-1397: entries filter by role and plan; empty means everyone", () => {
  assert.equal(entryAppliesTo({}, r()), true);
  assert.equal(entryAppliesTo({ roles: ["business"] }, r()), false);
  assert.equal(entryAppliesTo({ roles: ["talent"], plans: ["studio"] }, r()), false);
  assert.equal(entryAppliesTo({ roles: ["talent"], plans: ["free", "studio"] }, r()), true);
});

test("TUL-1397: the audience summary dedupes by email and drops non-consenting rows", () => {
  const rows = [
    r({ email: "A@example.com" }),
    r({ email: "a@example.com" }),
    r({ email: "b@example.com", language: "en", role: "client" }),
    r({ email: "c@example.com", marketingOptIn: false }),
  ];
  assert.deepEqual(summarizeAudiences("newsletter", rows), [
    { key: "tulala-client-en", recipients: 1 },
    { key: "tulala-talent-es", recipients: 1 },
  ]);
  assert.equal(summarizeAudiences("service", rows).reduce((n, s) => n + s.recipients, 0), 3);
});

const ENTRIES = [
  { title: "Promos para llenar tu semana", summary: "Crea un descuento en 3 toques.", url: "https://tulala.digital/es/novedades" },
  { title: "Posts <b>nuevos</b>", summary: "Escribe & publica.", url: "javascript:alert(1)" },
];

test("TUL-1397: monthly template renders in both languages with a working unsubscribe link", () => {
  const unsub = "https://tulala.digital/es/resources/unsubscribe?token=abc";
  const es = buildProductUpdateEmail({
    language: "es", year: 2026, month: 11, entries: ENTRIES, unsubscribeUrl: unsub, changelogUrl: "https://tulala.digital/es/novedades",
  });
  assert.equal(es.subject, "Novedades de Tulala: noviembre 2026");
  assert.match(es.html, /lang="es"/);
  assert.ok(es.html.includes(`href="${unsub}"`));
  assert.ok(es.html.includes("Darte de baja"));

  const en = buildProductUpdateEmail({
    language: "en", year: 2026, month: 11, entries: ENTRIES, unsubscribeUrl: "https://tulala.digital/resources/unsubscribe?token=abc", changelogUrl: "https://tulala.digital/changelog",
  });
  assert.equal(en.subject, "What's new at Tulala: November 2026");
  assert.ok(en.html.includes("Unsubscribe"));
});

test("TUL-1397: entry text is escaped and unsafe links are neutralised", () => {
  const out = buildProductUpdateEmail({
    language: "es", year: 2026, month: 1, entries: ENTRIES, unsubscribeUrl: "https://x.test/u", changelogUrl: "https://x.test/c",
  });
  assert.ok(!out.html.includes("<b>nuevos</b>"));
  assert.ok(out.html.includes("&lt;b&gt;nuevos&lt;/b&gt;"));
  assert.ok(!out.html.includes("javascript:"));
});

test("TUL-1397: an empty month still renders, and a missing unsubscribe URL throws", () => {
  const out = buildProductUpdateEmail({ language: "en", year: 2026, month: 2, entries: [], unsubscribeUrl: "https://x.test/u", changelogUrl: "https://x.test/c" });
  assert.match(out.html, /No updates for you this month/);
  assert.throws(() => buildProductUpdateEmail({ language: "en", year: 2026, month: 2, entries: [], unsubscribeUrl: "", changelogUrl: "https://x.test/c" }));
  assert.throws(() => buildLaunchEmail({ language: "es", headline: "h", summary: "s", ctaUrl: "https://x.test", unsubscribeUrl: "" }));
});

test("TUL-1397: launch email has headline, button and unsubscribe", () => {
  const out = buildLaunchEmail({ language: "es", headline: "Llegó la Edición de lanzamiento", summary: "Todo lo que construimos.", ctaUrl: "https://tulala.digital/es/novedades", unsubscribeUrl: "https://x.test/u" });
  assert.equal(out.subject, "Llegó la Edición de lanzamiento");
  assert.ok(out.html.includes("Ver qué hay de nuevo"));
  assert.ok(out.html.includes('href="https://x.test/u"'));
});

test("TUL-1397: no em dashes in copy, and nothing in this folder can send mail", () => {
  for (const f of readdirSync(HERE).filter((n) => n.endsWith(".ts") && !n.endsWith(".test.ts"))) {
    const src = readFileSync(join(HERE, f), "utf8");
    assert.ok(!src.includes("—"), `${f} has an em dash`);
    assert.doesNotMatch(src, /sendEmail|resend\.emails|emails\.send|broadcasts\.send|api\.resend\.com|resend-client/i, `${f} must not send`);
  }
});
