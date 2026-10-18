import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { ageTermsLinks } from "@/lib/legal/age-terms-links";
import { localizeNext } from "@/lib/marketing/hub-client-entry";

const read = (p: string) => readFileSync(p, "utf8");

test("TUL-856: the URL a visitor shares follows the page language", () => {
  assert.equal(localizeNext("https://staging.tulala.digital/t/TAL-93940", "es"), "https://staging.tulala.digital/es/t/TAL-93940");
  assert.equal(localizeNext("https://staging.tulala.digital/es/t/TAL-93940", "es"), "https://staging.tulala.digital/es/t/TAL-93940");
  assert.equal(localizeNext("https://staging.tulala.digital/t/TAL-93940", "en"), "https://staging.tulala.digital/t/TAL-93940");
  const view = read("src/app/t/[profileCode]/profile-view.tsx");
  assert.match(view, /const localizedShareUrl = localizeNext\(canonicalShareUrl, locale\)/);
  assert.equal((view.match(/canonicalUrl=\{localizedShareUrl\}/g) ?? []).length, 2, "both share rows use the localized URL");
  assert.match(view, /canonicalShareUrl=\{localizedShareUrl\}/);
});

test("TUL-856: auth popup and app landing legal links keep /es", () => {
  assert.deepEqual(ageTermsLinks("https://staging.tulala.digital/", "es"), {
    terms: "https://staging.tulala.digital/es/legal/terms",
    privacy: "https://staging.tulala.digital/es/legal/privacy",
  });
  const popup = read("src/components/client-account/ClientAccountButton.tsx");
  assert.match(popup, /ageTermsLinks\(site, loc\)\.terms/);
  assert.match(popup, /ageTermsLinks\(site, loc\)\.privacy/);
  assert.doesNotMatch(popup, /\$\{site\}\/legal\//);
  const landing = read("src/components/home/app-landing.tsx");
  assert.match(landing, /ageTermsLinks\(site, locale\)\.terms/);
  assert.doesNotMatch(landing, /\$\{site\}\/legal\//);
});

test("TUL-877 / TUL-1079: both 404 surfaces pick the language with notFoundLocale (browser language when nobody chose)", () => {
  const root = read("src/app/not-found.tsx");
  assert.match(root, /notFoundLocale\(/);
  assert.match(root, /const locale = await resolveNotFoundLocale\(\)/);
  assert.match(root, /export async function generateMetadata/);
  assert.match(root, /Página no encontrada · Tulala/);
  const branded = read("src/app/%5Fpage-not-found/page.tsx");
  assert.match(branded, /notFoundLocale\(/);
});

test("TUL-923: the booking phone default no longer lets an en-US browser beat the talent's country", () => {
  const f = read("src/components/public-booking/catalog-who-contact.tsx");
  assert.match(f, /timeZone: typeof Intl/);
});

test("TUL-928 / TUL-930: 390px booking sheet keeps the phone row inside the card and the day strip swipe-only", () => {
  const css = read("src/components/public-booking/catalog-booking-styles.ts");
  assert.match(css, /\.jb-phone\{display:flex;gap:8px;min-width:0\}/);
  assert.match(css, /\.jb-phone input\{flex:1 1 auto;min-width:0;width:100%\}/);
  assert.match(css, /@media \(max-width:719px\)\{\.jb-days\{scrollbar-width:none\}/);
  assert.match(css, /\.jb-week-nav\{display:none\}/);
  assert.match(css, /data-catalog-start-over/);
});

test("TUL-933: the service address is a wrapping textarea", () => {
  const f = read("src/components/public-booking/ServiceAddressField.tsx");
  assert.match(f, /<textarea/);
});

test("TUL-865: the /es hero keeps its scrim, text shadow and a solid white primary CTA", () => {
  const hero = read("src/components/marketing/hero-section.tsx");
  assert.match(hero, /linear-gradient\(100deg, rgba\(8,18,14,0\.96\)/);
  assert.match(hero, /textShadow: "0 1px 10px rgba\(8,18,14,0\.75\)"/);
  assert.match(hero, /background: "rgb\(255 255 255\)"/);
});
