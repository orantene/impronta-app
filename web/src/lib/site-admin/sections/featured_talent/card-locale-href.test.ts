import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { FeaturedTalentCard } from "./FeaturedTalentCard";
import { localeUrlSettings } from "@/i18n/pathnames";
import type { FeaturedTalentCardDTO } from "./fetch";

const SETTINGS = localeUrlSettings("en", ["en", "es"]);

const CARD = {
  id: "t1",
  profileCode: "TAL-00045",
  displayName: "More",
  thumbnailUrl: null,
  languages: [],
} as unknown as FeaturedTalentCardDTO;

const hrefsIn = (html: string): string[] =>
  Array.from(html.matchAll(/href="([^"]*)"/g)).map((m) => m[1]!);

// `FeaturedTalentCard` is memo()-wrapped, so it is an element type, not a
// callable — render it as an element.
const render = (props: Record<string, unknown>): string =>
  renderToStaticMarkup(
    createElement(FeaturedTalentCard, {
      card: CARD,
      ...props,
    } as Parameters<typeof FeaturedTalentCard>[0]),
  );

test("a Spanish card links to the Spanish talent route", () => {
  const html = render({ locale: "es", localeSettings: SETTINGS });
  assert.ok(
    hrefsIn(html).every((h) => h.startsWith("/es/t/")),
    `expected /es/t/… links, got ${hrefsIn(html).join(", ")}`,
  );
});

test("the default locale is byte-identical (no prefix)", () => {
  const en = render({ locale: "en", localeSettings: SETTINGS });
  const bare = render({});
  assert.deepEqual(hrefsIn(en), ["/t/TAL-00045"]);
  assert.deepEqual(hrefsIn(bare), ["/t/TAL-00045"]);
});

/**
 * An empty locale must skip localization: `withLocalePath` treats "" as a path
 * segment and emits `//t/<code>`, which a browser reads as protocol-relative —
 * i.e. a link to ANOTHER HOST. Guarding this is the whole reason the card
 * branches on `locale` instead of passing it through.
 */
test("an empty locale never produces a protocol-relative href", () => {
  for (const locale of ["", undefined]) {
    const html = render({ locale, localeSettings: SETTINGS });
    for (const href of hrefsIn(html)) {
      assert.ok(!href.startsWith("//"), `protocol-relative href: ${href}`);
      assert.equal(href, "/t/TAL-00045");
    }
  }
});

test("the tenant path prefix and the locale prefix compose", () => {
  const html = render({
    locale: "es",
    localeSettings: SETTINGS,
    publicPathPrefix: "/impronta",
  });
  assert.deepEqual(hrefsIn(html), ["/es/impronta/t/TAL-00045"]);
});
