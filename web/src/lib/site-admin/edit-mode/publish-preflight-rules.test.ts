import assert from "node:assert/strict";
import test from "node:test";

import {
  findInvalidInquiryCtas,
  isInquiryIntentLabel,
  isSectionHidden,
  isValidInquiryCtaHref,
} from "./publish-preflight-rules";

test("isSectionHidden only locks explicit hidden presentation", () => {
  assert.equal(isSectionHidden({ presentation: { visibility: "hidden" } }), true);
  assert.equal(
    isSectionHidden({ presentation: { visibility: "mobile-only" } }),
    false,
  );
});

test("inquiry intent labels are detected", () => {
  assert.equal(isInquiryIntentLabel("Book now"), true);
  assert.equal(isInquiryIntentLabel("Contact us"), true);
  assert.equal(isInquiryIntentLabel("Read more"), false);
});

test("valid inquiry href patterns are accepted", () => {
  assert.equal(isValidInquiryCtaHref("/contact"), true);
  assert.equal(isValidInquiryCtaHref("/en/inquiries/new"), true);
  assert.equal(isValidInquiryCtaHref("mailto:hello@example.com"), true);
  assert.equal(isValidInquiryCtaHref("#contact"), true);
  assert.equal(isValidInquiryCtaHref("/about"), false);
  assert.equal(isValidInquiryCtaHref("#"), false);
});

test("invalid inquiry CTA links are flagged", () => {
  const issues = findInvalidInquiryCtas("Hero", {
    primaryCta: { label: "Book now", href: "/about" },
    secondaryCta: { label: "Learn more", href: "/about" },
  });
  assert.equal(issues.length, 1);
  assert.match(issues[0] ?? "", /book now/i);
});
