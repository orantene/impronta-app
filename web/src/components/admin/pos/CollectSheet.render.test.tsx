import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createTranslator } from "@/i18n/messages";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { CollectSheet } from "./CollectSheet";
import { collectMethodUnavailableCopy, collectSheetCopy } from "./pos-copy";
import type { PosCollectionMethodState } from "./pos-types";
import { markupIncludesText } from "./test-html-helpers";

const LOCALES = ["en", "es", "fr"] as const;

function methods(unavailable: Partial<Record<"card" | "link" | "pass", string>>): PosCollectionMethodState[] {
  const build = (id: "card" | "link" | "pass"): PosCollectionMethodState =>
    id in unavailable
      ? { id, available: false, unavailableReason: unavailable[id] ?? "" }
      : { id, available: true };
  return [{ id: "cash", available: true }, build("card"), build("link"), build("pass")];
}

test("cash always renders first regardless of the order methods are passed in", () => {
  const t = createTranslator("en");
  const copy = collectSheetCopy(t);
  const out = renderToStaticMarkup(
    <CollectSheet
      amountDueCents={1000}
      currency="USD"
      methods={[
        { id: "card", available: true },
        { id: "cash", available: true },
      ]}
      activeMethod="cash"
      onSelectMethod={() => {}}
      tenderedCents={0}
      onKeypadPress={() => {}}
      onConfirmCash={() => {}}
      copy={copy}
    />,
  );
  const cashIndex = out.indexOf(copy.methodCash);
  const cardIndex = out.indexOf(copy.methodCard);
  assert.ok(cashIndex >= 0 && cardIndex >= 0);
  assert.ok(cashIndex < cardIndex, "cash must render before card");
});

test("a disabled method shows the exact honest sentence passed in, not a generic message", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    const unavailableCopy = collectMethodUnavailableCopy(t);
    const copy = collectSheetCopy(t);
    const cardDisabled = methods({ card: unavailableCopy.card });
    const markup = renderToStaticMarkup(
      <CollectSheet
        amountDueCents={500}
        currency="USD"
        methods={cardDisabled}
        activeMethod="card"
        onSelectMethod={() => {}}
        tenderedCents={0}
        onKeypadPress={() => {}}
        onConfirmCash={() => {}}
        copy={copy}
      />,
    );
    assert.ok(
      markupIncludesText(markup, unavailableCopy.card),
      `${locale}: expected the disabled card sentence in the markup`,
    );
  }
});

test("each of card/link/pass can independently show its own disabled sentence", () => {
  const t = createTranslator("en");
  const copy = collectSheetCopy(t);
  const unavailableCopy = collectMethodUnavailableCopy(t);

  for (const id of ["card", "link", "pass"] as const) {
    const markup = renderToStaticMarkup(
      <CollectSheet
        amountDueCents={500}
        currency="USD"
        methods={methods({ [id]: unavailableCopy[id] })}
        activeMethod={id}
        onSelectMethod={() => {}}
        tenderedCents={0}
        onKeypadPress={() => {}}
        onConfirmCash={() => {}}
        copy={copy}
      />,
    );
    assert.ok(markupIncludesText(markup, unavailableCopy[id]), `${id} disabled sentence missing`);
  }
});

test("the active method's own status box is never blank when it is not in the methods list at all", () => {
  // Regression: `active?.unavailableReason` used to render nothing here,
  // because `active` itself is `undefined` when `activeMethod`'s id has no
  // entry in `methods` — the same empty status box a caller can also hit by
  // marking a method unavailable with no reason (now impossible to
  // construct at all: `PosCollectionMethodState`'s `available: false` arm
  // requires `unavailableReason`, so that half of this finding is closed by
  // the type, not by this render test).
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    const copy = collectSheetCopy(t);
    const markup = renderToStaticMarkup(
      <CollectSheet
        amountDueCents={500}
        currency="USD"
        methods={[{ id: "cash", available: true }]}
        activeMethod="pass"
        onSelectMethod={() => {}}
        tenderedCents={0}
        onKeypadPress={() => {}}
        onConfirmCash={() => {}}
        copy={copy}
      />,
    );
    assert.ok(
      markupIncludesText(markup, copy.methodUnavailableFallback),
      `${locale}: expected the fallback sentence when the active method is not listed`,
    );
    const statusMatch = markup.match(/<p role="status"[^>]*>([^<]*)<\/p>/);
    assert.ok(statusMatch, `${locale}: no status box rendered at all`);
    assert.notEqual(statusMatch![1].trim(), "", `${locale}: status box rendered but was blank`);
  }
});

test("an available payment link renders its own ready state, not a blank panel", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    const copy = collectSheetCopy(t);
    const markup = renderToStaticMarkup(
      <CollectSheet
        amountDueCents={500}
        currency="USD"
        methods={[
          { id: "cash", available: true },
          { id: "link", available: true },
        ]}
        activeMethod="link"
        onSelectMethod={() => {}}
        tenderedCents={0}
        onKeypadPress={() => {}}
        onConfirmCash={() => {}}
        copy={copy}
      />,
    );
    assert.ok(markupIncludesText(markup, copy.linkReady), `${locale}: link ready state missing`);
  }
});

test("an available pass credit renders its own ready state, not a blank panel", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    const copy = collectSheetCopy(t);
    const markup = renderToStaticMarkup(
      <CollectSheet
        amountDueCents={500}
        currency="USD"
        methods={[
          { id: "cash", available: true },
          { id: "pass", available: true },
        ]}
        activeMethod="pass"
        onSelectMethod={() => {}}
        tenderedCents={0}
        onKeypadPress={() => {}}
        onConfirmCash={() => {}}
        copy={copy}
      />,
    );
    assert.ok(markupIncludesText(markup, copy.passReady), `${locale}: pass ready state missing`);
  }
});

test("cash tab shows tendered and change due, formatted with the shared money helper", () => {
  const t = createTranslator("en");
  const copy = collectSheetCopy(t);
  const markup = renderToStaticMarkup(
    <CollectSheet
      amountDueCents={1235}
      currency="USD"
      methods={[{ id: "cash", available: true }]}
      activeMethod="cash"
      onSelectMethod={() => {}}
      tenderedCents={2000}
      onKeypadPress={() => {}}
      onConfirmCash={() => {}}
      copy={copy}
    />,
  );
  assert.ok(markup.includes(formatOrderMoney(2000, "USD")), "tendered amount not shown");
  assert.ok(markup.includes(formatOrderMoney(765, "USD")), "change due not shown");
});

function confirmButtonTag(markup: string, label: string): string {
  const match = markup.match(new RegExp(`<button type="button"[^>]*>${label}</button>`));
  assert.ok(match, `confirm cash button ("${label}") not found in markup`);
  return match![0];
}

test("confirm cash is disabled while tender is short of the amount due, and enabled once it is enough", () => {
  const t = createTranslator("en");
  const copy = collectSheetCopy(t);
  const render = (tenderedCents: number) =>
    renderToStaticMarkup(
      <CollectSheet
        amountDueCents={1000}
        currency="USD"
        methods={[{ id: "cash", available: true }]}
        activeMethod="cash"
        onSelectMethod={() => {}}
        tenderedCents={tenderedCents}
        onKeypadPress={() => {}}
        onConfirmCash={() => {}}
        copy={copy}
      />,
    );

  const short = confirmButtonTag(render(500), copy.confirmCash);
  assert.match(short, /\bdisabled=""/);

  const enough = confirmButtonTag(render(1000), copy.confirmCash);
  assert.doesNotMatch(enough, /\bdisabled=""/);
});

test("an unavailable method whose reason is blank still tells the cashier something", () => {
  // A caller composing its reason as `lookup[id] ?? ""` satisfies the type and
  // still hands us nothing to say. The status line is the one place a cashier
  // looks when a method will not take money, so it must never be empty.
  const t = createTranslator("en");
  const copy = collectSheetCopy(t);
  for (const blank of ["", "   "]) {
    const markup = renderToStaticMarkup(
      <CollectSheet
        amountDueCents={1000}
        currency="USD"
        methods={[
          { id: "cash", available: true },
          { id: "card", available: false, unavailableReason: blank },
        ]}
        activeMethod="card"
        onSelectMethod={() => {}}
        tenderedCents={0}
        onKeypadPress={() => {}}
        onConfirmCash={() => {}}
        copy={copy}
      />,
    );
    const status = markup.match(/<p role="status"[^>]*>(.*?)<\/p>/);
    assert.ok(status, `no status line rendered for a blank reason (${JSON.stringify(blank)})`);
    assert.notEqual(
      status![1].trim(),
      "",
      `the status line was empty for a blank reason (${JSON.stringify(blank)})`,
    );
    assert.equal(status![1], copy.methodUnavailableFallback);
  }
});
