import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Button } from "./Button";
import { Layout, type EmailBrand } from "./Layout";

/**
 * Two emails arrived in the same inbox — one from a tenant workspace, one from
 * Tulala support — and they were indistinguishable: same card, same gold CTA,
 * same footer shape. Only the wordmark text differed.
 *
 * The cause was not a missing feature. `agency_branding` already held the
 * tenant's logo URL and brand colours, and the storefront and admin chrome
 * already read them. The email layer just had no colour or logo model at all:
 * `Button` hardcoded `#c9a227`, which `globals.css` names `--impronta-gold` —
 * one tenant's brand colour, shipped on every workspace's mail and on the
 * platform's own.
 *
 * These tests render the real components rather than asserting on the resolver,
 * because what reaches the reader is HTML.
 */

/** One tenant's real production branding shape: logo + a red brand colour. */
const TENANT: EmailBrand = {
  wordmark: "EL PAISA",
  accountName: "El Paisa",
  footerDomain: "elpaisa.example",
  homeHref: "https://elpaisa.example",
  logoUrl: "https://cdn.example/tenant/el-paisa/logo.png",
  accent: "#d21a28",
  accentOn: "#ffffff",
};

function render(brand?: EmailBrand): string {
  return renderToStaticMarkup(
    <Layout preview="p" brand={brand}>
      <Button href="https://example.com/x" brand={brand}>
        Open
      </Button>
    </Layout>,
  );
}

describe("the brand mark", () => {
  test("a tenant with a logo gets the logo, carrying their name as alt text", () => {
    const html = render(TENANT);
    assert.match(html, /<img[^>]+src="https:\/\/cdn\.example\/tenant\/el-paisa\/logo\.png"/);
    // Images are off by default for an unknown sender in Gmail. The alt text is
    // what brands the mail in that case, so a blank box is never the fallback.
    assert.match(html, /alt="El Paisa"/);
  });

  test("a tenant with no logo keeps their wordmark, and renders no broken image", () => {
    const html = render({ ...TENANT, logoUrl: null });
    assert.match(html, /EL PAISA/);
    assert.doesNotMatch(html, /<img/);
  });
});

describe("the call to action", () => {
  test("wears the tenant's brand colour", () => {
    const html = render(TENANT);
    assert.match(html, /background-color:#d21a28/);
  });

  test("never ships one tenant's gold to another tenant, or to the platform", () => {
    // The regression this whole change exists to prevent.
    assert.doesNotMatch(render(TENANT), /c9a227/i);
    assert.doesNotMatch(render(), /c9a227/i);
  });

  test("platform mail uses Tulala's own forest, so the two are told apart", () => {
    const platform = render();
    const tenant = render(TENANT);
    assert.match(platform, /background-color:#1e3a2d/);
    // The point of the change: the two CTAs are different colours. Asserting
    // each render carries its own and not the other's is the honest form —
    // the first `background-color` in the document is the body, not the CTA.
    assert.doesNotMatch(platform, /#d21a28/i);
    assert.doesNotMatch(tenant, /#1e3a2d/i);
  });

  test("a pale brand colour gets a dark label instead of unreadable white", () => {
    // A workspace whose accent is #ffc107 exists in production today.
    const html = render({ ...TENANT, accent: "#ffc107", accentOn: "#161a16" });
    assert.match(html, /background-color:#ffc107/);
    assert.match(html, /color:#161a16/);
  });

  test("falls back to the platform pair when a template renders with no brand", () => {
    const html = renderToStaticMarkup(
      <Button href="https://example.com/x" brand={undefined}>
        Open
      </Button>,
    );
    assert.match(html, /background-color:#1e3a2d/);
    assert.match(html, /color:#f4efe6/);
  });
});
