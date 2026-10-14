import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sanitizeUtmValue, utmFromSearch } from "./utm";

describe("sanitizeUtmValue", () => {
  it("lowercases and strips disallowed characters", () => {
    assert.equal(sanitizeUtmValue("Instagram"), "instagram");
    assert.equal(sanitizeUtmValue("a b@c.com"), "abccom");
    assert.equal(sanitizeUtmValue("Spring_Sale-24"), "spring_sale-24");
  });
  it("caps at 64 chars", () => {
    assert.equal(sanitizeUtmValue("a".repeat(100))?.length, 64);
  });
  it("returns null for empty, non-string, or fully stripped", () => {
    assert.equal(sanitizeUtmValue(""), null);
    assert.equal(sanitizeUtmValue("@@@"), null);
    assert.equal(sanitizeUtmValue(42), null);
    assert.equal(sanitizeUtmValue(null), null);
  });
});

describe("utmFromSearch", () => {
  it("extracts the three utm keys only", () => {
    assert.deepEqual(
      utmFromSearch("?utm_source=IG&utm_medium=bio&utm_campaign=Fall24&email=a@b.com&x=1"),
      { utm_source: "ig", utm_medium: "bio", utm_campaign: "fall24" },
    );
  });
  it("returns an empty object when nothing usable", () => {
    assert.deepEqual(utmFromSearch(""), {});
    assert.deepEqual(utmFromSearch(null), {});
    assert.deepEqual(utmFromSearch("?utm_source=%20"), {});
  });
});

import { buildLegacyProfileViewPayload, sanitizeReferrer } from "./utm";

describe("view_talent_profile payload", () => {
  it("carries a referrer reduced to its origin", () => {
    const p = buildLegacyProfileViewPayload({
      talentId: "t1",
      locale: "en",
      referrer: "https://l.instagram.com/path?u=secret&token=1#x",
      search: "?utm_source=IG",
    });
    assert.equal(p.referrer, "https://l.instagram.com");
    assert.equal(p.utm_source, "ig");
    assert.equal(p.talent_id, "t1");
  });
  it("omits referrer when empty or not http(s)", () => {
    assert.equal("referrer" in buildLegacyProfileViewPayload({ talentId: "t", locale: "en", referrer: "" }), false);
    assert.equal(sanitizeReferrer("android-app://com.x"), null);
    assert.equal(sanitizeReferrer("garbage"), null);
  });
});
