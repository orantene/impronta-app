import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

import {
  CONSENT_COOKIE,
  CONSENT_STORAGE_KEY,
  cookieGrantsAnalytics,
  hasAnalyticsConsent,
  isAnalyticsAllowed,
  resolveConsent,
  shouldShowBanner,
} from "./consent";
import { decideEnsureVisitorCookie } from "@/lib/site-admin/builder-node/experiment-visitor-cookie";
import {
  partitionTagsByConsent,
  selectTrackingForRender,
} from "@/lib/site-admin/tracking";

describe("consent resolution", () => {
  test("an explicit choice always wins over GPC", () => {
    assert.equal(resolveConsent("granted", true), "granted");
    assert.equal(resolveConsent("denied", false), "denied");
  });
  test("GPC with no choice resolves to denied and hides the banner", () => {
    assert.equal(resolveConsent(null, true), "denied");
    assert.equal(shouldShowBanner(null, true), false);
  });
  test("no choice and no GPC shows the banner and allows nothing", () => {
    assert.equal(resolveConsent(null, false), null);
    assert.equal(shouldShowBanner(null, false), true);
    assert.equal(isAnalyticsAllowed(null), false);
    assert.equal(isAnalyticsAllowed("denied"), false);
    assert.equal(isAnalyticsAllowed("granted"), true);
  });
  test("junk stored values are ignored", () => {
    assert.equal(resolveConsent("yes", false), null);
  });
});

describe("hasAnalyticsConsent (browser)", () => {
  beforeEach(() => {
    delete (globalThis as Record<string, unknown>).window;
    delete (globalThis as Record<string, unknown>).localStorage;
    Object.defineProperty(globalThis, "navigator", { value: undefined, configurable: true });
  });
  test("false on the server", () => {
    assert.equal(hasAnalyticsConsent(), false);
  });
  test("true when granted; GPC does not override an explicit grant", () => {
    (globalThis as Record<string, unknown>).window = {};
    (globalThis as Record<string, unknown>).localStorage = {
      getItem: (k: string) => (k === CONSENT_STORAGE_KEY ? "granted" : null),
    };
    Object.defineProperty(globalThis, "navigator", { value: { globalPrivacyControl: true }, configurable: true });
    assert.equal(hasAnalyticsConsent(), true);
  });
  test("blocked storage reads as no consent", () => {
    (globalThis as Record<string, unknown>).window = {};
    (globalThis as Record<string, unknown>).localStorage = {
      getItem() {
        throw new Error("blocked");
      },
    };
    assert.equal(hasAnalyticsConsent(), false);
  });
});

describe("server gating on the consent cookie", () => {
  test("cookie grants only on the exact value", () => {
    assert.equal(cookieGrantsAnalytics("analytics"), true);
    assert.equal(cookieGrantsAnalytics("denied"), false);
    assert.equal(cookieGrantsAnalytics(undefined), false);
    assert.equal(CONSENT_COOKIE, "tulala_consent");
  });
  test("visitor cookie is minted only with consent", () => {
    const base = { method: "GET", existingCookie: undefined, isRedirect: false };
    assert.equal(decideEnsureVisitorCookie(base).shouldSet, false);
    assert.equal(decideEnsureVisitorCookie({ ...base, consentCookie: "nope" }).shouldSet, false);
    assert.equal(decideEnsureVisitorCookie({ ...base, consentCookie: "analytics" }).shouldSet, true);
  });
});

describe("tenant tracking consent partition", () => {
  const cfg = {
    tenantId: "t1",
    providers: { ga4: "G-ABCD1234", gtm: "GTM-ABCD123", metaPixel: "123456789012345", plausible: "example.com" },
  };
  const sel = selectTrackingForRender(cfg, { tenantId: "t1" });
  const { immediate, afterConsent } = partitionTagsByConsent(sel.tags);

  test("Meta pixel is held until consent, nothing else is", () => {
    assert.deepEqual(afterConsent.map((t) => t.provider), ["metaPixel"]);
    assert.ok(!immediate.some((t) => t.provider === "metaPixel"));
  });
  test("consent default (denied) precedes every Google tag", () => {
    assert.equal(immediate[0].key, "consent-default");
    assert.match(immediate[0].code ?? "", /'denied'/);
    const firstGoogle = immediate.findIndex((t) => t.key.startsWith("ga4-") || t.key === "gtm-loader");
    assert.ok(firstGoogle > 0);
  });
  test("Plausible stays immediate (cookieless)", () => {
    assert.ok(immediate.some((t) => t.provider === "plausible"));
  });
  test("no consent default when no Google tag is connected", () => {
    const s = selectTrackingForRender({ tenantId: "t1", providers: { plausible: "example.com" } }, { tenantId: "t1" });
    assert.ok(!s.tags.some((t) => t.key === "consent-default"));
  });
});
