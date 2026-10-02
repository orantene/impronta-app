import assert from "node:assert/strict";
import test from "node:test";

import {
  findInvalidInquiryCtas,
  findSectionSwitcherIssues,
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

test("H-4 preflight: a section switcher needs two in-page menu links", () => {
  const withSwitcher = (navItems: unknown) => ({
    regions: { left: [], center: [{ type: "section_switcher" }], right: [] },
    navItems,
  });
  const one = findSectionSwitcherIssues("Header", "site_header", withSwitcher([{ label: "Menu", href: "#services" }]));
  assert.equal(one.length, 1);
  assert.match(one[0] ?? "", /at least two menu links/);
  // External and path links do not count: the switcher can only spy on anchors.
  assert.equal(
    findSectionSwitcherIssues("Header", "site_header", withSwitcher([{ label: "A", href: "#a" }, { label: "B", href: "/blog" }])).length,
    1,
  );
  assert.deepEqual(
    findSectionSwitcherIssues("Header", "site_header", withSwitcher([{ label: "A", href: "#a" }, { label: "B", href: "#b" }])),
    [],
  );
  // Not placed, hidden, another section, or links managed elsewhere: nothing to say.
  assert.deepEqual(findSectionSwitcherIssues("Header", "site_header", { regions: { left: [], center: [], right: [] }, navItems: [] }), []);
  assert.deepEqual(findSectionSwitcherIssues("Header", "site_header", { ...withSwitcher([]), presentation: { visibility: "hidden" } }), []);
  assert.deepEqual(findSectionSwitcherIssues("Hero", "hero", withSwitcher([])), []);
  assert.deepEqual(findSectionSwitcherIssues("Header", "site_header", withSwitcher(undefined)), []);
});
