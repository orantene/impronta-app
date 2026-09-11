import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createTranslator } from "@/i18n/messages";

import { CustomerDisplay, type CustomerDisplayProps, type CustomerDisplayScreen } from "./CustomerDisplay";
import { customerDisplayCopy, scanCopy } from "./customer-display-copy";
import { ScanStatus } from "./ScanStatus";
import { markupIncludesText } from "./test-html-helpers";

const LOCALES = ["en", "es", "fr"] as const;
const SCREENS: readonly CustomerDisplayScreen[] = [
  "idle",
  "review",
  "confirm",
  "waiting",
  "declined",
  "paid",
  "contact",
  "sent",
];

const SALE: CustomerDisplayProps["sale"] = {
  currency: "USD",
  lines: [
    { label: "House pizza", units: 2, totalCents: 3600 },
    { label: "Garlic bread", units: 1, totalCents: 650 },
  ],
  subtotalCents: 4250,
  discountCents: 0,
  totalCents: 4250,
  depositPaidCents: 1000,
  outstandingCents: 3250,
  customerName: "Laura",
  paidVia: "cash",
};

function render(locale: (typeof LOCALES)[number], over: Partial<CustomerDisplayProps>): string {
  const copy = customerDisplayCopy(createTranslator(locale));
  return renderToStaticMarkup(
    <CustomerDisplay
      screen="review"
      workspaceName="QA Journeys"
      sale={SALE}
      copy={copy}
      connectionLost={false}
      onLooksRight={() => {}}
      onBack={() => {}}
      onEmailMe={() => {}}
      onNoReceipt={() => {}}
      email=""
      onEmailChange={() => {}}
      onSend={() => {}}
      sending={false}
      receiptOutcome={null}
      {...over}
    />,
  );
}

test("every screen renders in all three languages and names itself", () => {
  for (const locale of LOCALES) {
    for (const screen of SCREENS) {
      const markup = render(locale, {
        screen,
        receiptOutcome: screen === "sent" ? { kind: "sent", email: "laura@example.com" } : null,
      });
      assert.match(markup, new RegExp(`data-pos-display-screen="${screen}"`), `${locale}/${screen}`);
      assert.doesNotMatch(markup, /\{(name|amount|workspace|email)\}/, `${locale}/${screen}: a placeholder leaked`);
      assert.doesNotMatch(markup, /—/, `${locale}/${screen}: no em dashes in customer-facing copy`);
    }
  }
});

test("D02: the review shows every line, the deposit already paid and the figure to pay, untouched", () => {
  const markup = render("en", { screen: "review" });
  assert.ok(markupIncludesText(markup, "House pizza"));
  assert.ok(markupIncludesText(markup, "Garlic bread"));
  assert.match(markup, /\$36\.00/);
  assert.match(markup, /\$6\.50/);
  // The deposit is shown as a subtraction and the balance is the reader's own.
  assert.match(markup, /-\$10\.00/);
  assert.match(markup, /data-pos-display-to-pay[^>]*>\$32\.50</);
  assert.match(markup, /Hi Laura, your visit today/);
});

test("D02: a walk-in gets the anonymous heading, never a blank name", () => {
  const markup = render("en", { screen: "review", sale: { ...SALE, customerName: null } });
  assert.match(markup, /Your visit today/);
  assert.doesNotMatch(markup, /Hi ,/);
});

test("tips are not offered, and the screen says so in every language", () => {
  for (const locale of LOCALES) {
    const copy = customerDisplayCopy(createTranslator(locale));
    const markup = render(locale, { screen: "review" });
    assert.ok(markupIncludesText(markup, copy.tipNotOffered), locale);
    // No tip control of any kind: nothing this screen invents can change a total.
    assert.doesNotMatch(markup, /10%|15%|20%/);
  }
});

test("D07: the paid screen says how much and how; text receipts are declined in a sentence", () => {
  for (const locale of LOCALES) {
    const copy = customerDisplayCopy(createTranslator(locale));
    const markup = render(locale, { screen: "paid" });
    assert.match(markup, /data-pos-display-paid[^>]*>[^<]*\$42\.50/);
    assert.ok(markupIncludesText(markup, copy.methodCash), locale);
    assert.ok(markupIncludesText(markup, copy.textNotOffered), locale);
    // The disabled control is described by the sentence, not left mute.
    assert.match(markup, /aria-describedby="pos-display-text-note"/);
    assert.match(markup, /<button[^>]*disabled=""[^>]*>[^<]*<\/button>/);
  }
});

test("D08: the contact screen shows a refusal as an alert sentence, in every language", () => {
  for (const locale of LOCALES) {
    const copy = customerDisplayCopy(createTranslator(locale));
    const markup = render(locale, {
      screen: "contact",
      receiptOutcome: { kind: "refused", sentence: copy.refusalSendFailed },
    });
    assert.match(markup, /role="alert"[^>]*data-pos-display-refusal/);
    assert.ok(markupIncludesText(markup, copy.refusalSendFailed), locale);
    assert.match(markup, /type="email"/);
  }
});

test("a sent receipt names the address; a skipped send says the email never left", () => {
  const sent = render("en", { screen: "sent", receiptOutcome: { kind: "sent", email: "laura@example.com" } });
  assert.match(sent, /We sent it to laura@example.com/);
  const skipped = render("en", { screen: "sent", receiptOutcome: { kind: "skipped", email: "laura@example.com" } });
  assert.match(skipped, /cannot send email yet/);
  assert.doesNotMatch(skipped, /We sent it to/);
});

test("a lost connection is one line on whatever screen is up, and never hides the sale", () => {
  const markup = render("en", { screen: "review", connectionLost: true });
  assert.match(markup, /data-pos-display-lost/);
  assert.ok(markupIncludesText(markup, "House pizza"));
});

test("every primary action on the display is at least 56px tall (h-14): this runs on a tablet", () => {
  for (const screen of ["review", "paid", "contact"] as const) {
    const markup = render("en", { screen });
    const buttons = [...markup.matchAll(/<button[^>]*class="([^"]*)"/g)].map((m) => m[1]);
    assert.ok(buttons.length > 0, screen);
    for (const cls of buttons) assert.match(cls, /\bh-14\b/, `${screen}: ${cls}`);
  }
});

test("the scanner chip and both toasts render in all three languages", () => {
  for (const locale of LOCALES) {
    const copy = scanCopy(createTranslator(locale));
    const ready = renderToStaticMarkup(<ScanStatus toast={null} onDismiss={() => {}} copy={copy} />);
    assert.match(ready, /data-pos-scanner-ready/);
    assert.ok(markupIncludesText(ready, copy.ready), locale);
    assert.doesNotMatch(ready, /data-pos-scan-toast/);
    const added = renderToStaticMarkup(
      <ScanStatus toast={{ kind: "added", sentence: "Added House pizza" }} onDismiss={() => {}} copy={copy} />,
    );
    assert.match(added, /role="status"[^>]*data-pos-scan-toast="added"/);
    assert.ok(markupIncludesText(added, copy.dismiss), locale);
  }
});
