import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { encodeQr } from "@/lib/links/qr";
import { decodeQr } from "@/lib/links/qr/roundtrip";

import {
  QrCodeBlock,
  composeQrUrl,
  shortLinkLabel,
} from "./qr-code-block";

/**
 * The `qr_code` block is FORK (b): a pure inline render that stores the link
 * CODE and composes `<origin>/q/<code>`. These pin the three things a later
 * "consistency" or "resilience" pass would most plausibly break — the URL is
 * composed not stored, an unscannable colour pair degrades instead of shipping,
 * and a too-long link degrades instead of crashing the page — plus the one
 * proof that matters: the symbol on the page decodes back to the exact URL.
 */

// ── URL composition: the block stores the code, composes the URL ─────────────

test("composeQrUrl builds <origin>/q/<code> and tolerates a trailing slash", () => {
  assert.equal(composeQrUrl("https://casarizo.com", "t7"), "https://casarizo.com/q/t7");
  assert.equal(composeQrUrl("https://casarizo.com/", "t7"), "https://casarizo.com/q/t7");
});

test("composeQrUrl with no origin still encodes the path (preview)", () => {
  assert.equal(composeQrUrl(undefined, "t7"), "/q/t7");
  assert.equal(composeQrUrl("", "t7"), "/q/t7");
});

test("shortLinkLabel strips the scheme for the typeable line", () => {
  assert.equal(shortLinkLabel("https://casarizo.com", "t7"), "casarizo.com/q/t7");
  assert.equal(shortLinkLabel("http://casarizo.com/", "t7"), "casarizo.com/q/t7");
  assert.equal(shortLinkLabel(undefined, "t7"), "/q/t7");
});

// ── The artefact is the fact: the rendered symbol decodes to the URL ─────────

test("the encoded symbol decodes back to the composed URL", () => {
  const url = composeQrUrl("https://casarizo.com", "t7");
  const { matrix, version, ecc } = encodeQr(url, { ecc: "M" });
  const decoded = decodeQr(matrix, version, ecc);
  assert.equal(decoded.text, url);
  assert.equal(decoded.syndromesClean, true);
});

// ── Component render ─────────────────────────────────────────────────────────

test("unconfigured (empty code) renders the placeholder, not a dangling /q/", () => {
  const html = renderToStaticMarkup(<QrCodeBlock code="" origin="https://casarizo.com" />);
  assert.match(html, /data-qr-code="empty"/);
  assert.match(html, /Pick a link/);
  assert.doesNotMatch(html, /<svg/);
});

test("a bound code renders an SVG, a scheme-less short link, and the aria label", () => {
  const html = renderToStaticMarkup(
    <QrCodeBlock code="t7" origin="https://casarizo.com" />,
  );
  assert.match(html, /data-qr-code="symbol"/);
  assert.match(html, /<svg/);
  assert.match(html, /data-qr-code="short-link"/);
  assert.match(html, /casarizo\.com\/q\/t7/);
  // The typeable line is scheme-less; the aria label carries the same handle.
  assert.match(html, /QR code linking to casarizo\.com\/q\/t7/);
});

test("showShortLink=false hides the typeable line", () => {
  const html = renderToStaticMarkup(
    <QrCodeBlock code="t7" origin="https://casarizo.com" showShortLink={false} />,
  );
  assert.doesNotMatch(html, /data-qr-code="short-link"/);
});

test("a caption renders when present", () => {
  const html = renderToStaticMarkup(
    <QrCodeBlock code="t7" origin="https://casarizo.com" caption="Table 7" />,
  );
  assert.match(html, /data-qr-code="caption"/);
  assert.match(html, /Table 7/);
});

test("a legible custom colour is honoured in the symbol", () => {
  // #1a1e22 on white is well above the 4.5:1 floor.
  const html = renderToStaticMarkup(
    <QrCodeBlock code="t7" origin="https://casarizo.com" dark="#1a1e22" />,
  );
  assert.match(html, /#1a1e22/);
});

test("a low-contrast pair degrades to black-on-white, never an unscannable code", () => {
  // #eeeeee on white is ~1.1:1 — below the floor. The live page must not ship it.
  const html = renderToStaticMarkup(
    <QrCodeBlock code="t7" origin="https://casarizo.com" dark="#eeeeee" light="#ffffff" />,
  );
  assert.doesNotMatch(html, /#eeeeee/);
  assert.match(html, /#000000/);
});

test("a link too long to encode degrades to a message, never a thrown render", () => {
  const longCode = "x".repeat(3000);
  const html = renderToStaticMarkup(
    <QrCodeBlock code={longCode} origin="https://casarizo.com" />,
  );
  assert.match(html, /data-qr-code="too-long"/);
  assert.doesNotMatch(html, /<svg/);
});
