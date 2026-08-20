import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyCanonicalIssue,
  classifyHrefIssue,
  collectLinkCandidates,
} from "./publish-preflight-link-rules";

test("collectLinkCandidates finds nested href/url fields", () => {
  const links = collectLinkCandidates({
    primaryCta: { href: "/inquiry" },
    cards: [
      { linkUrl: "https://example.com/a" },
      { nested: { href: "mailto:test@example.com" } },
    ],
    plain: "ignore",
  });
  assert.equal(links.length, 3);
  assert.equal(links.some((item) => item.href === "/inquiry"), true);
  assert.equal(links.some((item) => item.href === "https://example.com/a"), true);
  assert.equal(
    links.some((item) => item.href === "mailto:test@example.com"),
    true,
  );
});

test("collectLinkCandidates ignores string arrays under non-link keys", () => {
  // featured_talent.manualProfileCodes are talent codes, never anchors —
  // they must not be URL-validated (else they hard-block publish).
  const links = collectLinkCandidates({
    manualProfileCodes: ["TAL-92001", "TAL-00033"],
    requestCta: { href: "/contact" },
  });
  assert.equal(
    links.some((item) => item.href.startsWith("TAL-")),
    false,
  );
  assert.equal(links.some((item) => item.href === "/contact"), true);
});

test("classifyHrefIssue blocks unsafe protocols", () => {
  const issue = classifyHrefIssue("javascript:alert(1)");
  assert.ok(issue);
  assert.equal(issue?.severity, "error");
});

test("classifyHrefIssue accepts internal and mailto links", () => {
  assert.equal(classifyHrefIssue("/directory"), null);
  assert.equal(classifyHrefIssue("mailto:hello@example.com"), null);
});

test("classifyHrefIssue warns for http and errors for invalid URLs", () => {
  const httpIssue = classifyHrefIssue("http://example.com");
  assert.equal(httpIssue?.severity, "warn");
  const badIssue = classifyHrefIssue("not-a-valid-url");
  assert.equal(badIssue?.severity, "error");
});

test("classifyCanonicalIssue validates canonical semantics", () => {
  const issues = classifyCanonicalIssue({
    canonicalUrl: "http://example.com/path#frag",
    noindex: true,
  });
  assert.equal(issues.length >= 2, true);
  assert.equal(issues.some((item) => item.severity === "warn"), true);
});

test("classifyCanonicalIssue accepts root-relative canonicals", () => {
  // Seeded pages carry "/p/about" / "/es/p/home" — resolved against the
  // request host via metadataBase. These must NOT block publish.
  assert.deepEqual(
    classifyCanonicalIssue({ canonicalUrl: "/p/home", noindex: false }),
    [],
  );
  assert.deepEqual(
    classifyCanonicalIssue({ canonicalUrl: "/es/p/about", noindex: false }),
    [],
  );
});

test("classifyCanonicalIssue still flags hash fragments on relative canonicals", () => {
  const issues = classifyCanonicalIssue({
    canonicalUrl: "/p/home#top",
    noindex: false,
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.severity, "warn");
});

test("classifyCanonicalIssue rejects protocol-relative canonicals", () => {
  // "//evil.example" parses as a full URL on a different host — never treat
  // it as a root-relative path.
  const issues = classifyCanonicalIssue({
    canonicalUrl: "//evil.example/p/home",
    noindex: false,
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.severity, "error");
});

test("classifyCanonicalIssue still errors on garbage", () => {
  const issues = classifyCanonicalIssue({
    canonicalUrl: "not a url at all",
    noindex: false,
  });
  assert.equal(issues[0]?.severity, "error");
});
