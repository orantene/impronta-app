/**
 * Guest instant forms must render the tenant captcha widget whenever a
 * provider is active. Same incident class as form-node-captcha.test.ts:
 * the action demands a token the page must be able to produce.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const SRC = join(process.cwd(), "src");

test("GuestCaptchaField mounts hCaptcha and Turnstile from the tenant config", () => {
  const src = readFileSync(join(SRC, "components/public-booking/GuestCaptchaField.tsx"), "utf8");
  assert.ok(src.includes("h-captcha"), "hCaptcha widget missing");
  assert.ok(src.includes("cf-turnstile"), "Turnstile widget missing");
  assert.ok(src.includes("js.hcaptcha.com"), "hCaptcha script missing");
  assert.ok(src.includes("challenges.cloudflare.com/turnstile"), "Turnstile script missing");
});

test("guest instant confirm surfaces render GuestCaptchaField", () => {
  const composer = readFileSync(join(SRC, "components/public-booking/BookableComposer.tsx"), "utf8");
  const sheet = readFileSync(
    join(SRC, "app/t/[profileCode]/_shared/OfferingInstantMount.tsx"),
    "utf8",
  );
  const contact = readFileSync(
    join(SRC, "components/public-booking/GuestInstantContact.tsx"),
    "utf8",
  );
  const catalogFilter = readFileSync(
    join(SRC, "lib/site-admin/builder-node/services-catalog-filter.tsx"),
    "utf8",
  );
  const catalogRender = readFileSync(
    join(SRC, "lib/site-admin/builder-node/render.tsx"),
    "utf8",
  );
  const maxSite = readFileSync(
    join(SRC, "lib/talent-site/server/render-max-site.tsx"),
    "utf8",
  );
  assert.ok(contact.includes("GuestCaptchaField"));
  assert.ok(composer.includes("GuestInstantContact"));
  assert.ok(sheet.includes("GuestInstantContact"));
  // Catalog vanity sheet must receive tenant captcha (same class as form nodes).
  // Prefer bookingCaptcha (HQ-gated) with fallback to captcha for unsplit callers.
  assert.ok(catalogFilter.includes("captcha={captcha}"));
  assert.ok(
    catalogRender.includes("captcha={options.bookingCaptcha ?? options.captcha") ||
      catalogRender.includes("captcha={options.bookingCaptcha ?? options.captcha ?? null}"),
    "services_catalog must prefer bookingCaptcha over form captcha",
  );
  assert.ok(
    maxSite.includes('n.kind === "services_catalog"') || maxSite.includes("services_catalog"),
    "vanity Max site must resolve captcha for services_catalog, not only form nodes",
  );
});

test("TUL-62: signed-in booking form prefill wires chrome.client into InquiryDrawer", () => {
  const chrome = readFileSync(join(SRC, "lib/scheduling/guest-instant-chrome.ts"), "utf8");
  const composer = readFileSync(join(SRC, "components/public-booking/BookableComposer.tsx"), "utf8");
  const slotChrome = readFileSync(
    join(SRC, "app/t/[profileCode]/_shared/ProfileSlotPickerChrome.tsx"),
    "utf8",
  );
  const catalogRender = readFileSync(join(SRC, "lib/site-admin/builder-node/render.tsx"), "utf8");
  const catalogFilter = readFileSync(
    join(SRC, "lib/site-admin/builder-node/services-catalog-filter.tsx"),
    "utf8",
  );
  const catalogRow = readFileSync(
    join(SRC, "lib/site-admin/builder-node/services-catalog-row.tsx"),
    "utf8",
  );
  assert.match(chrome, /client:\s*GuestInstantClient\s*\|\s*null/);
  assert.match(chrome, /client_profiles/);
  assert.match(composer, /client\?:/);
  assert.match(composer, /trust_level:\s*"verified"/);
  assert.doesNotMatch(composer, /client=\{null\}/);
  assert.match(slotChrome, /client=\{chrome\.client\}/);
  // Normalized options expose headerWidgets on dataSources, not options root.
  assert.match(
    catalogRender,
    /dataSources\.headerWidgets\?\.account\?\.signedIn/,
    "services_catalog signedIn must read dataSources.headerWidgets (NormalizedBuilderNodeRenderOptions)",
  );
  assert.doesNotMatch(
    catalogRender,
    /options\.headerWidgets\?\.account/,
    "options.headerWidgets is not on NormalizedBuilderNodeRenderOptions",
  );
  // max-lines headroom: CatalogRow lives beside the filter, not inside it.
  assert.match(catalogFilter, /from "\.\/services-catalog-row"/);
  assert.match(catalogRow, /export function CatalogRow/);
  assert.match(catalogFilter, /signedIn/);
});

/** TUL-452: studio Live booking band must not inherit English cookie / light-on-white. */
test("studio Live booking passes page locale and isolates ink + overflow", () => {
  const band = readFileSync(join(SRC, "lib/site-admin/builder-node/live-booking-bands.tsx"), "utf8");
  const render = readFileSync(join(SRC, "lib/site-admin/builder-node/render.tsx"), "utf8");
  const contact = readFileSync(join(SRC, "components/public-booking/GuestInstantContact.tsx"), "utf8");
  const bookClient = readFileSync(join(SRC, "app/(public)/book/BookPageClient.tsx"), "utf8");
  const slot = readFileSync(join(SRC, "components/public-booking/SlotPicker.tsx"), "utf8");
  assert.match(band, /locale=\{locale\}/, "LiveBookingBand must forward locale into BookPageClient");
  assert.match(
    render,
    /locale=\{options\.contentLocale\?\.locale \?\? options\.visitorLocale\}/,
    "renderer must pass page locale into LiveBookingBand",
  );
  assert.match(band, /overflow:\s*"visible"/, "studio booking chrome must not clip Turnstile");
  assert.match(band, /token-color-ink/, "studio booking chrome must set readable ink");
  assert.match(contact, /appearance="always"/, "embedded guest captcha must stay visible");
  assert.match(contact, /translatorFor/, "guest contact must not use dashboard-cookie useT alone");
  assert.match(bookClient, /locale=\{pageLocale\}/, "BookPageClient must thread locale into composer");
  assert.match(slot, /style=\{\{\s*color:\s*INK\s*\}\}/, "slot buttons must set ink (not inherit light theme)");
});
