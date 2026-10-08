import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeWhatsappNumber,
  siteAddressOf,
  webOfficeLinks,
  webOfficeSocialEnabled,
  whatsappHref,
  whatsappMessage,
  whatsappNumberFromHref,
  withSourceWhatsapp,
} from "./web-office-social";

test("plan gate: only the paid Web Office plan", () => {
  assert.equal(webOfficeSocialEnabled("talent_portfolio"), true);
  assert.equal(webOfficeSocialEnabled("talent_basic"), false);
  assert.equal(webOfficeSocialEnabled("talent_pro"), false);
  assert.equal(webOfficeSocialEnabled(null), false);
});

test("number normalization", () => {
  assert.equal(normalizeWhatsappNumber("+52 (55) 1234-5678"), "525512345678");
  assert.equal(normalizeWhatsappNumber("123"), null);
  assert.equal(normalizeWhatsappNumber("0123456789"), null);
  assert.equal(normalizeWhatsappNumber(null), null);
});

test("number from a link she set", () => {
  assert.equal(whatsappNumberFromHref("https://wa.me/525512345678"), "525512345678");
  assert.equal(whatsappNumberFromHref("https://wa.me/525512345678?text=hi"), "525512345678");
  assert.equal(whatsappNumberFromHref("https://api.whatsapp.com/send?phone=525512345678"), "525512345678");
  assert.equal(whatsappNumberFromHref("https://example.com/525512345678"), null);
});

test("whatsappHref: encoded, bilingual, null without a number", () => {
  const es = whatsappHref({ number: "+52 55 1234 5678", locale: "es", siteLabel: "jor.example.com" })!;
  assert.ok(es.startsWith("https://wa.me/525512345678?text="));
  assert.equal(decodeURIComponent(es.split("?text=")[1]!), "Hola, vengo de tu sitio web (jor.example.com). Quisiera reservar contigo.");
  const en = whatsappHref({ number: "525512345678", locale: "en", siteLabel: "jor.example.com" })!;
  assert.equal(decodeURIComponent(en.split("?text=")[1]!), "Hi, I found you on your website (jor.example.com). I'd like to book with you.");
  assert.equal(whatsappHref({ number: null, locale: "es", siteLabel: "x" }), null);
  assert.equal(whatsappHref({ number: "12", locale: "en" }), null);
});

test("messages: no em dashes, no empty parentheses", () => {
  for (const l of ["es", "en", "fr"]) {
    for (const s of ["a.b", ""]) {
      const m = whatsappMessage(l, s);
      assert.ok(!/[—–]/.test(m));
      assert.ok(!m.includes("()"));
    }
  }
});

test("links: only those she has, ordered, never invented", () => {
  const recs = [
    { platform: "whatsapp", href: "https://wa.me/525512345678" },
    { platform: "instagram", href: "https://instagram.com/jor" },
    { platform: "facebook", href: "https://facebook.com/jor" },
  ];
  const links = webOfficeLinks(recs, "es", "jor.example.com");
  assert.deepEqual(links.map((l) => l.platform), ["instagram", "whatsapp"]);
  assert.equal(links[1]!.ariaLabel, "Escríbeme por WhatsApp");
  assert.ok(links[1]!.href.includes("text="));
  assert.equal(webOfficeLinks(recs, "en", "x")[1]!.ariaLabel, "Message me on WhatsApp");
  assert.deepEqual(webOfficeLinks([], "es", "x"), []);
  assert.deepEqual(webOfficeLinks([{ platform: "whatsapp", href: "https://wa.me/12" }], "es", "x"), []);
});

test("withSourceWhatsapp only rewrites the WhatsApp record", () => {
  const out = withSourceWhatsapp(
    [{ platform: "instagram", href: "https://instagram.com/jor" }, { platform: "whatsapp", href: "https://wa.me/525512345678" }],
    "en",
    "a.b",
  );
  assert.equal(out[0]!.href, "https://instagram.com/jor");
  assert.ok(out[1]!.href.includes("?text="));
});

test("site address", () => {
  assert.equal(siteAddressOf({ canonicalOrigin: "https://jor.com", canonicalPath: "/" }), "jor.com");
  assert.equal(siteAddressOf({ canonicalOrigin: "https://app.tulala.digital", canonicalPath: "/t/site/jor/x", siteSlug: "jor" }), "app.tulala.digital/t/site/jor");
  assert.equal(siteAddressOf({}), "");
});
