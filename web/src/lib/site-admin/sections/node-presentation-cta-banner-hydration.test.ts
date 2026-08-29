import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CtaBannerComponent } from "./cta_banner/Component";

test("cta banner headline omits an empty style attribute (hydration #418)", () => {
  const html = renderToStaticMarkup(
    createElement(CtaBannerComponent, {
      props: {
        headline: "Cuéntanos sobre tu proyecto.",
        presentation: {},
        variant: "centered-overlay",
        imageSide: "right",
        bandTone: "ivory",
        insetCard: true,
      },
      tenantId: "00000000-0000-0000-0000-000000000001",
      locale: "en",
      preview: false,
    }),
  );
  assert.match(html, /class="site-cta-banner__headline"/);
  assert.doesNotMatch(
    html,
    /site-cta-banner__headline"[^>]*style="/,
    "an empty style bag on the h2 serializes as style=\"\" on the client and no attribute on the server",
  );
});
