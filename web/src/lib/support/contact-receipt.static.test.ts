import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// A person who writes to us gets told we have it.
//
// The /contact form created a ticket, sent the owner five notifications, and
// sent the writer nothing. Verified on production: no dispatch row has ever
// existed for a contact-form address. The page directly above that form is
// headed "A real person answers"; the form's entire reply to a stranger was
// "Sending…" and then silence.
//
// It went unnoticed because the sibling path — the chat panel's email capture —
// has always emitted the confirmation, so the feature looked covered. Copying
// the sibling's shape is exactly what a reviewer would have done; checking that
// BOTH entry points emit is what catches it.

const SOURCE = readFileSync(
  join(process.cwd(), "src", "lib", "support", "guest-actions.ts"),
  "utf8",
);

/** Body of an exported action, so an emit in one cannot vouch for another. */
function actionBody(name: string): string {
  const start = SOURCE.indexOf(`export async function ${name}(`);
  assert.ok(start > -1, `${name} not found`);
  const next = SOURCE.indexOf("\nexport async function ", start + 1);
  return SOURCE.slice(start, next === -1 ? SOURCE.length : next);
}

test("every entry point that takes an email tells the sender we have it", () => {
  for (const action of ["submitMarketingContactAction", "attachGuestContactAction"]) {
    const body = actionBody(action);
    assert.match(
      body,
      /support\.guest\.contact\.confirm/,
      `${action} takes an email address and never acknowledges it`,
    );
  }
});

test("the receipt carries a ticket number, so the sender has something to refer to", () => {
  const body = actionBody("submitMarketingContactAction");
  assert.match(body, /ticketNumber/, "receipt has no ticket number");
  assert.match(body, /contactEmail/, "receipt has no recipient");
});

test("the receipt does not claim somebody replied", () => {
  // It used to render AgentReply, so the acknowledgement opened with
  // "<agent> replied" and "There is a new reply on your ticket" when nobody
  // had. A false receipt is worse than none: the reader goes hunting for an
  // answer that does not exist.
  const entries = readFileSync(
    join(process.cwd(), "src", "lib", "notifications", "catalog-entries-support.ts"),
    "utf8",
  );
  const start = entries.indexOf('id: "support.guest.contact.confirm"');
  assert.ok(start > -1, "confirm entry not found");
  // Strip comments first. The initial version of this test failed on the
  // comment that EXPLAINS the fix, because the explanation names the template
  // it replaced — a guard matching prose rather than code, which has reddened
  // main here before.
  const block = entries
    .slice(start, start + 1400)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
  assert.match(block, /MessageReceived/, "confirm entry is not using the receipt template");
  assert.doesNotMatch(block, /AgentReply/, "confirm entry still renders a reply template");
});
