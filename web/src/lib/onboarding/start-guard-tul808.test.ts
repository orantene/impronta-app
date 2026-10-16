import assert from "node:assert/strict";
import test from "node:test";

import { renderSetup } from "./start-setup-render-helper";

const STUDIO_COPY = { es: "En mi estudio", en: "At my studio" } as const;

for (const locale of ["es", "en"] as const) {
  test(`TUL-808 (${locale}): a cleaning business is only offered 'I go to the client', preselected`, () => {
    const html = renderSetup(locale, { tradeKey: "cleaning" });
    assert.ok(html.includes('data-testid="onb-place-client"'));
    assert.ok(!html.includes('data-testid="onb-place-studio"'));
    assert.ok(!html.includes('data-testid="onb-place-home"'));
    assert.ok(!html.includes(STUDIO_COPY[locale]), "no 'at my studio' for a cleaning business");
    assert.ok(/role="radio" aria-checked="true" data-testid="onb-place-client"/.test(html), "client is preselected");
  });

  test(`TUL-808 (${locale}): a beauty trade keeps studio, home and client`, () => {
    const html = renderSetup(locale, { tradeKey: "lashes" });
    for (const m of ["studio", "home", "client"]) assert.ok(html.includes(`data-testid="onb-place-${m}"`), m);
    assert.ok(html.includes(STUDIO_COPY[locale]));
  });

  test(`TUL-808 (${locale}): a trade with no pack is offered all three places`, () => {
    const html = renderSetup(locale, { tradeKey: null });
    assert.equal((html.match(/data-testid="onb-place-(studio|home|client)"/g) ?? []).length, 3);
  });
}
