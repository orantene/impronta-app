import test from "node:test";
import assert from "node:assert/strict";
import { embedCopy, embedsConsented, privacyEmbedSrc } from "./consent-embed-logic";

test("embedsConsented: false with no signals", () => {
  assert.equal(embedsConsented({ cookieHeader: "", analyticsConsent: null }), false);
  assert.equal(embedsConsented({ cookieHeader: "a=1", analyticsConsent: "denied" }), false);
});

test("embedsConsented: reads the tulala_consent cookie", () => {
  assert.equal(embedsConsented({ cookieHeader: "x=1; tulala_consent=analytics,embeds", analyticsConsent: null }), true);
  assert.equal(embedsConsented({ cookieHeader: "tulala_consent=analytics", analyticsConsent: null }), false);
  assert.equal(embedsConsented({ cookieHeader: "tulala_consent=%5B%22embeds%22%5D", analyticsConsent: null }), true);
});

test("embedsConsented: accepts granted analytics consent", () => {
  assert.equal(embedsConsented({ cookieHeader: "", analyticsConsent: "granted" }), true);
});

test("privacyEmbedSrc uses youtube-nocookie", () => {
  assert.equal(privacyEmbedSrc("https://www.youtube.com/embed/abc"), "https://www.youtube-nocookie.com/embed/abc");
  assert.equal(privacyEmbedSrc("https://player.vimeo.com/video/1"), "https://player.vimeo.com/video/1");
});

test("embedCopy localizes en/es", () => {
  assert.equal(embedCopy("en", "youtube").load, "Load content from YouTube");
  assert.equal(embedCopy("es-MX", "maps").load, "Cargar contenido de Google Maps");
});
