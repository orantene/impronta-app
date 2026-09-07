import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  TULALA_EMAIL_ACCENT,
  TULALA_EMAIL_ACCENT_ON,
  httpsLogoUrl,
  normalizeBrandHex,
  readableOn,
} from "./email-palette";

describe("normalizeBrandHex", () => {
  test("accepts #rgb and #rrggbb, lowercased", () => {
    assert.equal(normalizeBrandHex("#ABC"), "#abc");
    assert.equal(normalizeBrandHex("  #D21A28 "), "#d21a28");
  });

  test("rejects anything that is not a plain hex literal", () => {
    const bad = [
      "",
      "   ",
      "red",
      "#12",
      "#1234",
      "#12345",
      "#1234567",
      "var(--tl-forest)",
      "rgb(0,0,0)",
      "#12345g",
      null,
      undefined,
      42,
      {},
    ];
    for (const v of bad) assert.equal(normalizeBrandHex(v), null, String(v));
  });
});

describe("readableOn", () => {
  test("puts white on a dark accent", () => {
    assert.equal(readableOn(TULALA_EMAIL_ACCENT), "#ffffff");
    assert.equal(readableOn("#d21a28"), "#ffffff");
  });

  test("puts near-black on a pale accent rather than unreadable white", () => {
    // #ffc107 and #d4af37 are both real workspace accents in production.
    // White label on either fails every contrast bar — this is the case the
    // hardcoded white-on-gold button got wrong.
    assert.equal(readableOn("#ffc107"), "#161a16");
    assert.equal(readableOn("#d4af37"), "#161a16");
    assert.equal(readableOn("#ffffff"), "#161a16");
  });

  test("expands 3-digit hex before measuring", () => {
    assert.equal(readableOn("#fff"), readableOn("#ffffff"));
    assert.equal(readableOn("#000"), readableOn("#000000"));
  });

  test("falls back to white for an invalid colour", () => {
    // Callers pair this with a dark default accent, so white stays safe.
    assert.equal(readableOn("not-a-colour"), "#ffffff");
  });
});

describe("httpsLogoUrl", () => {
  const real =
    "https://pluhdapdnuiulvxmyspd.supabase.co/storage/v1/object/public/media-public/tenant/x/branding/y.png";

  test("accepts an absolute https URL", () => {
    assert.equal(httpsLogoUrl(real), real);
    assert.equal(httpsLogoUrl(`  ${real}  `), real);
  });

  test("rejects a relative path — an inbox has no origin to resolve it against", () => {
    assert.equal(httpsLogoUrl("/logo.png"), null);
    assert.equal(httpsLogoUrl("logo.png"), null);
  });

  test("rejects non-https schemes", () => {
    assert.equal(httpsLogoUrl("http://example.com/logo.png"), null);
    assert.equal(httpsLogoUrl("data:image/png;base64,AAAA"), null);
    assert.equal(httpsLogoUrl("javascript:alert(1)"), null);
  });

  test("rejects empty and non-string values", () => {
    for (const v of ["", "   ", null, undefined, 7, {}]) {
      assert.equal(httpsLogoUrl(v), null, String(v));
    }
  });
});

describe("platform accent", () => {
  test("is the canonical --tl-forest pair, not one tenant's gold", () => {
    assert.equal(TULALA_EMAIL_ACCENT, "#1e3a2d");
    assert.equal(TULALA_EMAIL_ACCENT_ON, "#f4efe6");
    // #c9a227 is --impronta-gold: one tenant's brand colour, which used to be
    // hardcoded as the button background of every email the platform sends.
    assert.notEqual(TULALA_EMAIL_ACCENT, "#c9a227");
  });
});
