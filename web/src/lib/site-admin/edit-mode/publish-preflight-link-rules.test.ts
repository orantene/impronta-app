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
