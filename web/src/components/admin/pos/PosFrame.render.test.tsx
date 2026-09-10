import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createTranslator } from "@/i18n/messages";
import { POS_MODE_META } from "@/lib/pos/modes";
import { PosFrame } from "./PosFrame";
import { railCopy } from "./pos-copy";

const LOCALES = ["en", "es", "fr"] as const;

test("the rail's rows come from POS_MODE_META, not a list of its own", () => {
  const t = createTranslator("en");
  const copy = railCopy(t);
  const markup = renderToStaticMarkup(
    <PosFrame
      mode="counter"
      activeDestination="sell"
      onSelectDestination={() => {}}
      destinationLabels={copy}
    >
      <div>content</div>
    </PosFrame>,
  );
  // Exactly POS_MODE_META.counter.destinations, in that order, and nothing
  // this component invented on its own — this is the direct test that the
  // rail is a PROJECTION of the mode metadata, not a second list.
  const buttonLabels = [...markup.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((m) => m[1]);
  assert.deepEqual(
    buttonLabels,
    POS_MODE_META.counter.destinations.map((id) => copy[id]),
  );
});

test("the active destination carries aria-current=page and no other row does", () => {
  const t = createTranslator("en");
  const markup = renderToStaticMarkup(
    <PosFrame
      mode="counter"
      activeDestination="orders"
      onSelectDestination={() => {}}
      destinationLabels={railCopy(t)}
    >
      <div />
    </PosFrame>,
  );
  const currentMatches = markup.match(/aria-current="page"/g) ?? [];
  assert.equal(currentMatches.length, 1);
});

test("rail labels render in all three shipped languages", () => {
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    const copy = railCopy(t);
    const markup = renderToStaticMarkup(
      <PosFrame mode="counter" activeDestination="sell" onSelectDestination={() => {}} destinationLabels={copy}>
        <div />
      </PosFrame>,
    );
    for (const destinationId of POS_MODE_META.counter.destinations) {
      assert.ok(
        markup.includes(copy[destinationId]),
        `${locale}: rail missing label for "${destinationId}"`,
      );
    }
  }
});

test("children render inside the content slot", () => {
  const t = createTranslator("en");
  const markup = renderToStaticMarkup(
    <PosFrame mode="counter" activeDestination="sell" onSelectDestination={() => {}} destinationLabels={railCopy(t)}>
      <div data-testid="sell-surface">sell surface here</div>
    </PosFrame>,
  );
  assert.match(markup, /data-testid="sell-surface"/);
});
