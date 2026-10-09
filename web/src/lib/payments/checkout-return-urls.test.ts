/**
 * TUL-350 slice 1: booking checkout return URLs follow request host + locale.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { buildCheckoutReturnUrls } from "./checkout-return-urls";
import { localeUrlSettings } from "@/i18n/pathnames";

test("English (platform default) stays unprefixed on the given origin", () => {
  const got = buildCheckoutReturnUrls({
    origin: "https://jor.tulala.digital",
    locale: "en",
  });
  assert.equal(
    got.successUrl,
    "https://jor.tulala.digital/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  );
  assert.equal(got.cancelUrl, "https://jor.tulala.digital/checkout/cancel");
});

test("Spanish on an English-default grammar gets /es/ on the same host", () => {
  const got = buildCheckoutReturnUrls({
    origin: "https://book.example.com",
    locale: "es",
  });
  assert.equal(
    got.successUrl,
    "https://book.example.com/es/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  );
  assert.equal(got.cancelUrl, "https://book.example.com/es/checkout/cancel");
});

test("Spanish-default tenant keeps Spanish unprefixed; English gets /en/", () => {
  const settings = localeUrlSettings("es", ["es", "en"]);
  const es = buildCheckoutReturnUrls({
    origin: "https://custom.mx",
    locale: "es",
    localeSettings: settings,
  });
  assert.equal(
    es.successUrl,
    "https://custom.mx/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  );
  assert.equal(es.cancelUrl, "https://custom.mx/checkout/cancel");

  const en = buildCheckoutReturnUrls({
    origin: "https://custom.mx",
    locale: "en",
    localeSettings: settings,
  });
  assert.equal(
    en.successUrl,
    "https://custom.mx/en/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  );
  assert.equal(en.cancelUrl, "https://custom.mx/en/checkout/cancel");
});

test("trailing slash on origin is stripped once", () => {
  const got = buildCheckoutReturnUrls({
    origin: "https://shop.test/",
    locale: "en",
  });
  assert.equal(
    got.successUrl,
    "https://shop.test/checkout/success?session_id={CHECKOUT_SESSION_ID}",
  );
});

test("rows 1-3 build return URLs via buildCheckoutReturnUrls, never process.env.NEXT_PUBLIC_BASE_URL", () => {
  const root = join(process.cwd(), "src");
  const files = [
    "lib/server-actions/instant-book-action.ts",
    "lib/server-actions/client-pipeline.ts",
    "lib/storefront/appointment-picker.core.ts",
  ];
  for (const rel of files) {
    const src = readFileSync(join(root, rel), "utf8");
    assert.match(
      src,
      /buildCheckoutReturnUrls/,
      `${rel} must call buildCheckoutReturnUrls`,
    );
    // Comments may name the anti-pattern; the env read itself must stay gone.
    assert.doesNotMatch(
      src,
      /process\.env\.NEXT_PUBLIC_BASE_URL/,
      `${rel} must not read NEXT_PUBLIC_BASE_URL for checkout URLs`,
    );
  }
});

test("rows 1-3 pass tenant localeSettings into buildCheckoutReturnUrls", () => {
  const root = join(process.cwd(), "src");
  const instant = readFileSync(join(root, "lib/server-actions/instant-book-action.ts"), "utf8");
  const pipeline = readFileSync(join(root, "lib/server-actions/client-pipeline.ts"), "utf8");
  const pickerServer = readFileSync(
    join(root, "lib/storefront/appointment-picker.server.ts"),
    "utf8",
  );
  const pickerCore = readFileSync(
    join(root, "lib/storefront/appointment-picker.core.ts"),
    "utf8",
  );
  assert.match(instant, /getRequestLocaleUrlSettings/);
  assert.match(pipeline, /getRequestLocaleUrlSettings/);
  assert.match(pickerServer, /getRequestLocaleUrlSettings/);
  assert.match(pickerCore, /localeSettings:\s*deps\.localeSettings/);
});

test("instant-book unwinds the hold when publicOrigin is missing after place", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/server-actions/instant-book-action.ts"),
    "utf8",
  );
  const originFail = src.slice(src.indexOf("const origin = await publicOrigin()"));
  const branch = originFail.slice(0, originFail.indexOf("const localeSettings"));
  assert.match(branch, /unwindFailedCheckout/);
  assert.match(branch, /checkout_origin_unavailable/);
});

test("publicOrigin resolves via resolveTrustedPublicOrigin (not raw x-forwarded-host)", () => {
  const src = readFileSync(
    join(process.cwd(), "src/lib/storefront/request-context.ts"),
    "utf8",
  );
  assert.match(src, /resolveTrustedPublicOrigin/);
  assert.match(src, /getPublicHostContext/);
  // Must not prefer forwarded host ahead of the stamped / Host pair.
  assert.doesNotMatch(
    src,
    /x-forwarded-host\"\)\s*\?\?\s*h\.get\(\"host\"\)/,
  );
});
