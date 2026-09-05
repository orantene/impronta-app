import test from "node:test";
import assert from "node:assert/strict";

import {
  whatsAppHref, mailToHref, instagramHref, canUseNativeShare,
  qrAssetHref, displayShortLink,
} from "./share-targets";

const content = {
  url: "https://casarizo.com/q/t7",
  message: "Reserve a table at Casa Rizo",
  subject: "Casa Rizo",
};

test("WhatsApp opens the contact picker rather than messaging the operator", () => {
  const href = whatsAppHref(content);
  assert.match(href, /^https:\/\/wa\.me\/\?text=/);
  // A number here would send the operator their own code.
  assert.doesNotMatch(href, /wa\.me\/\d/);
});

test("the shared text is encoded, so an ampersand cannot truncate it", () => {
  const href = whatsAppHref({ url: content.url, message: "Fish & chips night" });
  assert.ok(href.includes("%26"), "ampersand must be percent-encoded");
  assert.doesNotMatch(href.split("?text=")[1]!, /&/, "no bare ampersand in the payload");
  // And it round-trips back to exactly what we meant to send.
  const decoded = decodeURIComponent(href.split("?text=")[1]!);
  assert.equal(decoded, `Fish & chips night\n${content.url}`);
});

test("the link is last in the message, so the preview attaches to it", () => {
  const decoded = decodeURIComponent(whatsAppHref(content).split("?text=")[1]!);
  assert.ok(decoded.endsWith(content.url));
  assert.ok(decoded.includes("\n"), "url on its own line");
});

test("mailto encodes newlines rather than emitting them raw", () => {
  const href = mailToHref(content);
  // A literal newline terminates the header in some clients and the rest of
  // the body vanishes with no error.
  assert.doesNotMatch(href, /\n/);
  assert.ok(href.includes("%0A"));
  assert.match(href, /^mailto:\?subject=/);
});

test("mailto leaves the recipient empty for the sender to choose", () => {
  assert.match(mailToHref(content), /^mailto:\?/);
});

test("mailto falls back to the message when no subject is given", () => {
  const href = mailToHref({ url: content.url, message: "Book again" });
  assert.ok(href.includes(encodeURIComponent("Book again")));
});

test("Instagram returns null instead of a plausible-looking dead URL", () => {
  // Instagram has no prefilled share URL. A button that opens Instagram to
  // nothing is worse than one that tells you to copy the link.
  assert.equal(instagramHref(), null);
});

test("native share is detected by capability, not by user agent", () => {
  assert.equal(canUseNativeShare({ share: () => {} }), true);
  assert.equal(canUseNativeShare({}), false);
  assert.equal(canUseNativeShare(undefined), false);
});

test("QR asset URLs are per format and encode the code", () => {
  assert.equal(qrAssetHref("t7", "png"), "/api/links/t7/qr.png");
  assert.equal(qrAssetHref("t7", "svg"), "/api/links/t7/qr.svg");
  assert.equal(qrAssetHref("t7", "pdf", { widthMm: 100 }), "/api/links/t7/qr.pdf?mm=100");
  // A code is constrained to [a-z0-9-] but encode anyway: this function must
  // not be the reason a future code shape becomes an injection point.
  assert.equal(qrAssetHref("a b", "png"), "/api/links/a%20b/qr.png");
});

test("the printed short link drops the scheme, because nobody types https", () => {
  assert.equal(displayShortLink("https://casarizo.com/q/t7"), "casarizo.com/q/t7");
  assert.equal(displayShortLink("http://casarizo.com/q/t7/"), "casarizo.com/q/t7");
  assert.equal(displayShortLink("https://casarizo.com/"), "casarizo.com");
});
