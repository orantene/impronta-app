/**
 * #187: a portfolio caption renders in the visitor's language, and a shot
 * without `caption_i18n` renders exactly as before.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { createBuilderNode } from "./create";
import { resolvePortfolioAlt, resolvePortfolioCaption } from "./portfolio-i18n";
import { renderBuilderNodes } from "./render";
import type { BuilderNode } from "./types";
import type { TalentPortfolioShot } from "./portfolio-types";

function node(): BuilderNode {
  const base = createBuilderNode("portfolio");
  return { ...base, id: "port-1", props: { ...base.props, showCaptions: true } } as BuilderNode;
}

/** Same mapping the loader applies to a media row. */
function shotFor(metadata: Record<string, unknown>, locale: string): TalentPortfolioShot {
  const caption = resolvePortfolioCaption(metadata, locale, "es");
  return {
    id: "m1",
    url: "https://example.test/m1.jpg",
    alt: resolvePortfolioAlt({ metadata, alt: null, caption, locale, primaryLocale: "es" }),
    caption,
    offeringId: null,
    offeringTitle: null,
    albumId: null,
  };
}

function render(shots: TalentPortfolioShot[], locale: string): string {
  return renderToStaticMarkup(
    renderBuilderNodes([node()], {
      mode: "freeform",
      includeRendererStyles: false,
      includeFontLinks: false,
      visitorLocale: locale,
      dataSources: { talentPortfolioShots: shots },
    }) as Parameters<typeof renderToStaticMarkup>[0],
  );
}

const meta = { caption: "Uñas en gel", caption_i18n: { es: "Uñas en gel", en: "Gel nails" } };

test("EN page shows the English caption, ES page the Spanish one", () => {
  const en = render([shotFor(meta, "en")], "en");
  const es = render([shotFor(meta, "es")], "es");
  assert.match(en, /Gel nails/);
  assert.doesNotMatch(en, /Uñas en gel/);
  assert.match(es, /Uñas en gel/);
  assert.doesNotMatch(es, /Gel nails/);
});

test("a shot without caption_i18n is unchanged", () => {
  const resolved = shotFor({ caption: "Uñas en gel" }, "en");
  const plain: TalentPortfolioShot = {
    id: "m1",
    url: "https://example.test/m1.jpg",
    alt: "Uñas en gel",
    caption: "Uñas en gel",
    offeringId: null,
    offeringTitle: null,
    albumId: null,
  };
  assert.equal(render([resolved], "en"), render([plain], "en"));
});
