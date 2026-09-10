import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createTranslator } from "@/i18n/messages";
import { PosRefusalBanner } from "./PosRefusalBanner";
import { refusalCopy } from "./pos-copy";
import { POS_REFUSAL_REASONS } from "./pos-types";
import { markupIncludesText } from "./test-html-helpers";

/**
 * THE LIST IS NOT COPIED HERE, and that is the point.
 *
 * This file used to carry its own five-entry array. Adding a reason to the
 * type without also editing this array left the new sentence proved by
 * nothing, in any language — the test kept passing while covering less. It
 * iterates the exported vocabulary now, so a reason that gains no catalogue
 * entry fails here the moment it exists.
 */
const REASONS = POS_REFUSAL_REASONS;

const LOCALES = ["en", "es", "fr"] as const;

test("every refusal reason renders its own sentence, in all three shipped languages", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    const copy = refusalCopy(t);
    for (const reason of REASONS) {
      const markup = renderToStaticMarkup(<PosRefusalBanner reason={reason} copy={copy} />);
      assert.ok(
        markupIncludesText(markup, copy[reason]),
        `${locale}/${reason}: expected the rendered markup to contain "${copy[reason]}"`,
      );
      // No key ever resolves to its own dotted path — that is the
      // "raw key on the screen" failure message-key-usage.static.test.ts
      // exists to catch (see its own header).
      assert.ok(!markup.includes("dashboard.pos.counter.refusal"));
    }
  }
});

test("each reason renders a DIFFERENT sentence — never a generic message", () => {
  const t = createTranslator("en");
  const copy = refusalCopy(t);
  const sentences = new Set(REASONS.map((reason) => copy[reason]));
  assert.equal(sentences.size, REASONS.length);
});

test("role=alert is present so a cashier's screen reader announces it", () => {
  const t = createTranslator("en");
  const copy = refusalCopy(t);
  const markup = renderToStaticMarkup(<PosRefusalBanner reason="paymentDeclined" copy={copy} />);
  assert.match(markup, /role="alert"/);
});

test("saleReloading offers Reload, paymentDeclined offers Try again, needsCustomerName offers neither", () => {
  const t = createTranslator("en");
  const copy = refusalCopy(t);
  const onRetry = () => {};

  const reloading = renderToStaticMarkup(
    <PosRefusalBanner reason="saleReloading" copy={copy} onRetry={onRetry} />,
  );
  assert.ok(markupIncludesText(reloading, copy.reload));

  const declined = renderToStaticMarkup(
    <PosRefusalBanner reason="paymentDeclined" copy={copy} onRetry={onRetry} />,
  );
  assert.ok(markupIncludesText(declined, copy.retry));

  const needsName = renderToStaticMarkup(
    <PosRefusalBanner reason="needsCustomerName" copy={copy} onRetry={onRetry} />,
  );
  assert.ok(!markupIncludesText(needsName, copy.retry));
  assert.ok(!markupIncludesText(needsName, copy.reload));
});
