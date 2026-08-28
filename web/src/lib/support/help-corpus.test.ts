import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  flattenHelpCorpus,
  insightRowsToCorpus,
  retrieveHelpEntries,
  SUPPORT_CATEGORIES,
  tokenize,
} from "./help-corpus";

describe("help-corpus", () => {
  test("SUPPORT_CATEGORIES includes ticket categories from the registry", () => {
    assert.ok(SUPPORT_CATEGORIES.includes("Billing"));
    assert.ok(SUPPORT_CATEGORIES.includes("General"));
    assert.ok(SUPPORT_CATEGORIES.includes("Bookings & inquiries"));
  });

  test("flattenHelpCorpus keeps slug, purpose, and ticketCategory", () => {
    const rows = flattenHelpCorpus();
    const domain = rows.find((r) => r.slug === "domain");
    assert.ok(domain);
    assert.ok(domain.purpose.length > 10);
    assert.equal(typeof domain.ticketCategory, "string");
  });

  test("tokenize drops stopwords and short tokens", () => {
    assert.deepEqual(tokenize("How do I change my domain"), ["change", "domain"]);
  });

  test("origin slug and category get a hard boost", () => {
    const mini = flattenHelpCorpus().filter((e) =>
      ["domain", "branding", "plan-billing"].includes(e.slug),
    );
    const hits = retrieveHelpEntries("something unrelated", {
      originSlug: "domain",
      category: "Public site & domains",
      corpus: mini,
    });
    assert.equal(hits[0]?.slug, "domain");
  });

  test("lexical overlap ranks a domain question onto the domain entry", () => {
    const hits = retrieveHelpEntries("how do I connect a custom domain", {
      extraTexts: ["the public site is not resolving"],
    });
    assert.ok(hits.length <= 4);
    assert.ok(
      hits.some((h) => h.slug === "domain" || /domain/i.test(h.purpose)),
      "expected a domain-related grounding entry",
    );
  });

  test("confirmed insights join the corpus as past confirmed resolution", () => {
    const extra = insightRowsToCorpus([
      {
        id: "11111111-1111-1111-1111-111111111111",
        summary: "Custom domain DNS check stalled after switching the primary host",
        root_cause: "The DNS probe ran before nameservers propagated",
        product_area: "Public site & domains",
      },
    ]);
    assert.equal(extra[0]?.category, "past confirmed resolution");
    const hits = retrieveHelpEntries("dns check after changing the primary domain", {
      extraCorpus: extra,
      corpus: [],
    });
    assert.equal(hits[0]?.slug.startsWith("insight:"), true);
  });
});
