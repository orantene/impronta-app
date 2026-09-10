import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createTranslator } from "@/i18n/messages";
import { POS_MODE_META } from "@/lib/pos/modes";
import { PosFrame } from "./PosFrame";
import { railCopy, railNavLabel } from "./pos-copy";

const LOCALES = ["en", "es", "fr"] as const;

test("the rail's rows come from POS_MODE_META, not a list of its own", () => {
  const t = createTranslator("en");
  const copy = railCopy(t);
  const markup = renderToStaticMarkup(
    <PosFrame
      mode="counter"
      navLabel={railNavLabel(t)}
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
      navLabel={railNavLabel(t)}
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
      <PosFrame
        mode="counter"
        navLabel={railNavLabel(t)}
        activeDestination="sell"
        onSelectDestination={() => {}}
        destinationLabels={copy}
      >
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

test("the nav region's own aria-label is translated in all three languages, never the English mode constant", () => {
  // Regression for the bug where the lookup was `destinationLabels[mode]`
  // (destinationLabels is keyed by destination id, never by mode id, so
  // that lookup could never hit) falling through to `POS_MODE_META.counter
  // .label`, which is hard-coded English — "Counter" rendered in es and fr
  // alike. `navLabel` must now carry the request's own translation.
  const expectedByLocale: Record<(typeof LOCALES)[number], string> = {
    en: "Counter",
    es: "Mostrador",
    fr: "Comptoir",
  };
  for (const locale of LOCALES) {
    const t = createTranslator(locale);
    const navLabel = railNavLabel(t);
    assert.equal(navLabel, expectedByLocale[locale], `${locale}: rail nav label not translated`);
    const markup = renderToStaticMarkup(
      <PosFrame
        mode="counter"
        navLabel={navLabel}
        activeDestination="sell"
        onSelectDestination={() => {}}
        destinationLabels={railCopy(t)}
      >
        <div />
      </PosFrame>,
    );
    assert.match(markup, new RegExp(`aria-label="${expectedByLocale[locale]}"`));
    if (locale !== "en") {
      assert.doesNotMatch(markup, /aria-label="Counter"/);
    }
  }
});

test("children render inside the content slot", () => {
  const t = createTranslator("en");
  const markup = renderToStaticMarkup(
    <PosFrame
      mode="counter"
      navLabel={railNavLabel(t)}
      activeDestination="sell"
      onSelectDestination={() => {}}
      destinationLabels={railCopy(t)}
    >
      <div data-testid="sell-surface">sell surface here</div>
    </PosFrame>,
  );
  assert.match(markup, /data-testid="sell-surface"/);
});
