import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Layout } from "./Layout";

// The footer says two things to every reader: why they got this, and how to
// stop. Both were wrong for a large share of recipients.
//
// It stated flatly "you have an account with Tulala" — hardcoded, so guest
// support visitors, contact-form senders and invitees were told they had an
// account they never made. Those are the readers most likely to answer that by
// pressing "report spam", because the sentence reads as evidence that something
// signed them up without asking.
//
// And both lines were hardcoded English inside emails that are otherwise
// translated, so a Spanish reader's email stopped being Spanish exactly at the
// sentence explaining why they got it and the link to stop getting it.

function render(brand: Record<string, unknown>, unsubscribeUrl?: string): string {
  // JSX rather than createElement: Layout declares `children` as a required
  // prop, so the third-argument form does not satisfy the overload, while the
  // lint rule forbids passing children inside props. JSX satisfies both.
  return renderToStaticMarkup(
    <Layout
      preview="p"
      brand={brand as never}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel="offer updates"
    >
      <p>body</p>
    </Layout>,
  );
}

test("a guest is not told they have an account", () => {
  const html = render({ recipientHasAccount: false });
  assert.doesNotMatch(html, /you have an account/i);
  assert.match(html, /this address was used to contact/i);
});

test("an account holder still gets the account wording", () => {
  assert.match(render({ recipientHasAccount: true }), /you have an account/i);
});

test("an unset flag keeps the account wording, never the guest wording", () => {
  // Defaulting the other way would tell real customers they are strangers.
  assert.match(render({}), /you have an account/i);
});

test("a Spanish email does not end in English", () => {
  const html = render({ locale: "es", recipientHasAccount: false }, "https://x.test/u");
  assert.match(html, /Recibes esto porque/);
  assert.doesNotMatch(html, /You received this because/);
  assert.match(html, /Cancelar la suscripci/);
  assert.doesNotMatch(html, /Unsubscribe/);
});

test("a Spanish unsubscribe line carries no English category noun", () => {
  // "offer updates" is an English label; interpolating it into Spanish reads
  // worse than the slightly less specific phrasing.
  const html = render({ locale: "es", recipientHasAccount: true }, "https://x.test/u");
  assert.doesNotMatch(html, /offer updates/);
  assert.match(html, /estos correos/);
});

test("English keeps the specific category, which is the more useful wording", () => {
  assert.match(render({ locale: "en" }, "https://x.test/u"), /offer updates emails/);
});

test("a required category renders no unsubscribe link at all", () => {
  // Password resets and billing notices pass no URL. Offering to stop sending
  // somebody their own password reset would be worse than no link.
  const html = render({ locale: "es" });
  assert.doesNotMatch(html, /Cancelar la suscripci/);
  assert.doesNotMatch(html, /Unsubscribe/);
});
