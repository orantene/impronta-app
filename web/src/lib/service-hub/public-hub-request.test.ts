import assert from "node:assert/strict";
import test from "node:test";

import { contactMessagePrefill } from "./roster-request";
import { publicEntryRequestHref, publicEntryRequestMessage } from "./public-hub-request";

const entry = { name: "Private chef", who: ["Rafa", "Dani"] };

test("the request message names the entry, and the talents only when the entry gave names", () => {
  assert.equal(publicEntryRequestMessage(entry, "en"), "I'd like to request: Private chef (with Rafa, Dani).");
  assert.equal(publicEntryRequestMessage({ name: "Private chef", who: [] }, "en"), "I'd like to request: Private chef.");
  assert.equal(publicEntryRequestMessage(entry, "es"), "Quiero solicitar: Private chef (con Rafa, Dani).");
});

test("the link is the contact form with ?message=, decodes back, and carries no ids, prices or payment parameters", () => {
  const href = publicEntryRequestHref("/contact", entry, "en");
  assert.match(href, /^\/contact\?message=/);
  const message = new URL(href, "https://x.test").searchParams.get("message");
  assert.equal(message, publicEntryRequestMessage(entry, "en"));
  assert.equal(contactMessagePrefill({ message: message ?? undefined }), message);
  assert.doesNotMatch(href, /price|amount|pay|checkout|listing|profile|offering/i);
});
