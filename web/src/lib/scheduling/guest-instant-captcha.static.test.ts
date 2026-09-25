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
  assert.ok(catalogFilter.includes("captcha={captcha}"));
  assert.ok(catalogRender.includes("captcha={options.captcha"));
  assert.ok(
    maxSite.includes('n.kind === "services_catalog"') || maxSite.includes("services_catalog"),
    "vanity Max site must resolve captcha for services_catalog, not only form nodes",
  );
});
