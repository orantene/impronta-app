/**
 * TUL-516 P1 — Demo badge + language toast are out of document flow so theme
 * headers are the first in-flow content.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { LocaleSuggestionBannerClient } from "@/components/locale-suggestion-banner-client";
import { FLOATING_CHROME_STACK_CSS } from "@/lib/talent-site/floating-chrome-stack";
import { SiteDemoBadge } from "@/lib/talent-site/site-demo-badge";
import { DEMO_SITE_BADGE_TIP } from "@/lib/talent/demo-talent";
import { HeaderDemoPill } from "@/lib/site-admin/sections/site_header/header-site-chrome";

const root = join(process.cwd(), "src");

describe("TUL-516 P1 demo + language float", () => {
  test("Demo badge markup is out-of-flow (data attr + tip); stack CSS pins position:fixed", () => {
    const html = renderToStaticMarkup(<SiteDemoBadge locale="en" />);
    assert.match(html, /data-site-demo-badge=""/);
    assert.match(html, /Demo/);
    assert.match(html, new RegExp(DEMO_SITE_BADGE_TIP.en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(FLOATING_CHROME_STACK_CSS, /\[data-site-demo-badge\]\{position:fixed/);
    assert.doesNotMatch(html, /padding:\s*["']?6px 16px 0/);
  });

  test("Demo tip localizes to Spanish", () => {
    const html = renderToStaticMarkup(<SiteDemoBadge locale="es" />);
    assert.match(html, new RegExp(DEMO_SITE_BADGE_TIP.es.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  test("HeaderDemoPill paints the floating badge; MaxSiteDemoPill re-exports it", () => {
    assert.equal(renderToStaticMarkup(<HeaderDemoPill show={false} />), "");
    assert.match(renderToStaticMarkup(<HeaderDemoPill show locale="es" />), /data-site-demo-badge=""/);
    const demoSrc = readFileSync(join(root, "lib/talent-site/server/render-max-site-demo.tsx"), "utf8");
    assert.match(demoSrc, /return <SiteDemoBadge locale=\{locale\} \/>/);
  });

  test("language toast markup has no in-flow shrink row; stack CSS pins fixed bottom", () => {
    const html = renderToStaticMarkup(
      <LocaleSuggestionBannerClient
        href="/en"
        locale="en"
        localeCookieName="locale"
        secureCookies={false}
        prompt="Would you rather read this page in English?"
        acceptLabel="Switch to English"
        dismissLabel="No thanks"
        regionLabel="Language suggestion"
      />,
    );
    assert.match(html, /data-locale-suggestion="en"/);
    assert.match(html, /class="print:hidden"/);
    assert.doesNotMatch(html, /class="[^"]*shrink-0[^"]*print:hidden/);
    assert.match(html, /Switch to English/);
    assert.match(FLOATING_CHROME_STACK_CSS, /\[data-locale-suggestion\]\{position:fixed/);
  });

  test("public shell mounts Demo badge once when isDemo (not gated on landmark)", () => {
    const src = readFileSync(join(root, "lib/talent-site/server/render-max-site.tsx"), "utf8");
    assert.match(src, /args\.isDemo \? <MaxSiteDemoPill locale=\{locale\} \/>/);
    assert.doesNotMatch(src, /headerHasLandmark\) \? <MaxSiteDemoPill/);
    const header = readFileSync(join(root, "lib/site-admin/sections/site_header/Component.tsx"), "utf8");
    assert.doesNotMatch(header, /demoPill/);
    assert.doesNotMatch(header, /HeaderDemoPill/);
  });
});
