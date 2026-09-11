import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createTranslator } from "@/i18n/messages";

import { CustomerDisplay, type CustomerDisplayProps, type CustomerDisplayScreen } from "./CustomerDisplay";
import { customerDisplayCopy, customerDisplayTipCopy, scanCopy } from "./customer-display-copy";
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
  tipCents: 0,
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

function tipState(over: Partial<CustomerDisplayProps["tip"]> = {}, locale: (typeof LOCALES)[number] = "en"): NonNullable<CustomerDisplayProps["tip"]> {
  return {
    step: "choose",
    customCents: 0,
    saving: false,
    refusal: null,
    onPick: () => {},
    onOther: () => {},
    onChange: () => {},
    onKey: () => {},
    onBack: () => {},
    onConfirm: () => {},
    copy: customerDisplayTipCopy(createTranslator(locale)),
    ...over,
  };
}

test("D02: the tip chooser offers 10 / 15 / 20 percent of the services, Other and No tip, in every language", () => {
  for (const locale of LOCALES) {
    const copy = customerDisplayTipCopy(createTranslator(locale));
    const markup = render(locale, { screen: "review", tip: tipState({}, locale) });
    assert.ok(markupIncludesText(markup, copy.heading), locale);
    // 10% of $42.50 is $4.25, 15% is $6.38, 20% is $8.50: the figure under each tile is the reader's arithmetic.
    assert.match(markup, /data-pos-display-tip-percent="10"[^>]*>[\s\S]*?\$4\.25/);
    assert.match(markup, /data-pos-display-tip-percent="15"[^>]*>[\s\S]*?\$6\.38/);
    assert.match(markup, /data-pos-display-tip-percent="20"[^>]*>[\s\S]*?\$8\.50/);
    assert.match(markup, /data-pos-display-tip-other/);
    assert.match(markup, /data-pos-display-tip-none/);
    assert.ok(markupIncludesText(markup, copy.note), `${locale}: nothing is charged from the chooser`);
    assert.doesNotMatch(markup, /—/);
  }
});

test("D02: a tip already on the sale reads as a row and a Change action; D03 is the custom keypad", () => {
  const withTip = render("en", { screen: "review", sale: { ...SALE, tipCents: 500, totalCents: 4750, outstandingCents: 3750 }, tip: tipState() });
  assert.match(withTip, /data-pos-display-tip-row/);
  assert.match(withTip, /data-pos-display-tip="added"/);
  assert.match(withTip, /Tip added · \$5\.00/);
  assert.match(withTip, /data-pos-display-to-pay[^>]*>\$37\.50</);

  const custom = render("en", { screen: "review", tip: tipState({ step: "custom", customCents: 1500 }) });
  assert.match(custom, /data-pos-display-tip="custom"/);
  assert.match(custom, /data-pos-display-tip-custom[^>]*>\$15\.00</);
  assert.match(custom, /Total would be \$47\.50/);
  assert.match(custom, /data-pos-display-tip-confirm/);
});

test("without a tip state (the sale is past collection) the review says tips cannot be added", () => {
  for (const locale of LOCALES) {
    const copy = customerDisplayCopy(createTranslator(locale));
    const markup = render(locale, { screen: "review" });
    assert.ok(markupIncludesText(markup, copy.tipNotOffered), locale);
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

test("the scan toast renders both outcomes in all three languages, and Undo only when it can", () => {
  // The `Scanner ready` chip moved to the sell surface's own search bar
  // (`SellSurface`, `data-pos-scanner-ready`); this component is the toast.
  for (const locale of LOCALES) {
    const copy = scanCopy(createTranslator(locale));
    const idle = renderToStaticMarkup(<ScanStatus toast={null} onDismiss={() => {}} copy={copy} />);
    assert.doesNotMatch(idle, /data-pos-scan-toast/);
    const added = renderToStaticMarkup(
      <ScanStatus toast={{ kind: "added", sentence: "Added · House pizza", onUndo: () => {} }} onDismiss={() => {}} copy={copy} />,
    );
    assert.match(added, /role="status"[^>]*data-pos-scan-toast="added"/);
    assert.ok(markupIncludesText(added, copy.dismiss), locale);
    assert.ok(markupIncludesText(added, copy.undo), locale);
    assert.match(added, /data-pos-scan-undo/);
    const missed = renderToStaticMarkup(
      <ScanStatus toast={{ kind: "no_match", sentence: "Nothing matches x" }} onDismiss={() => {}} copy={copy} />,
    );
    assert.match(missed, /data-pos-scan-toast="no_match"/);
    assert.doesNotMatch(missed, /data-pos-scan-undo/, "a miss has nothing to undo");
  }
});
