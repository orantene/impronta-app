import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAiSearchDocument,
  type AiSearchDocumentOffering,
  type BuildAiSearchDocumentInput,
} from "@/lib/ai/build-ai-search-document";
import {
  AI_DOC_OFFERING_DESCRIPTION_MAX,
  AI_DOC_OFFERINGS_MAX,
  AI_DOC_OFFERINGS_SECTION_MAX,
} from "@/lib/ai/ai-search-document-offerings";

// F1 (TUL-1273 deferred): published services feed the talent's AI search document.
// D-10: only PUBLISHED + APPROVED + PUBLIC offerings; never agency_only / on_request /
// pending / rejected / draft / archived.

function baseInput(offerings: AiSearchDocumentOffering[]): BuildAiSearchDocumentInput {
  return {
    displayName: "Sofia Martinez",
    firstName: null,
    lastName: null,
    primaryTalentTypeLabel: "Makeup Artist",
    locationLabel: null,
    heightCm: null,
    shortBio: null,
    bioEn: null,
    offerings,
  };
}

function sellable(over: Partial<AiSearchDocumentOffering>): AiSearchDocumentOffering {
  return {
    id: "00000000-0000-0000-0000-000000000001",
    title: "Bridal makeup",
    category: "Weddings",
    description: "Full bridal look with trial session.",
    sortOrder: 0,
    status: "published",
    moderation_state: "approved",
    visibility: "public",
    ...over,
  };
}

test("F1: a published, approved, public offering's title, category and description are in the document", () => {
  const doc = buildAiSearchDocument(baseInput([sellable({})]));
  assert.match(doc, /Bridal makeup/);
  assert.match(doc, /Weddings/);
  assert.match(doc, /Full bridal look with trial session\./);
});

test("F1 D-10: private, pending, rejected, draft and archived offerings never reach the document", () => {
  const hidden: AiSearchDocumentOffering[] = [
    sellable({ id: "a", title: "SecretAgencyOnly", visibility: "agency_only" }),
    sellable({ id: "b", title: "SecretOnRequest", visibility: "on_request" }),
    sellable({ id: "c", title: "SecretPending", moderation_state: "pending" }),
    sellable({ id: "d", title: "SecretRejected", moderation_state: "rejected" }),
    sellable({ id: "e", title: "SecretDraft", status: "draft" }),
    sellable({ id: "f", title: "SecretArchived", status: "archived" }),
    // Missing gate fields fail CLOSED.
    { id: "g", title: "SecretUngated", category: null, description: null },
  ];
  const doc = buildAiSearchDocument(baseInput([...hidden, sellable({ id: "z", title: "Public facial" })]));
  assert.match(doc, /Public facial/);
  assert.doesNotMatch(doc, /Secret/);
});

test("F1: offerings section is deterministic regardless of input order", () => {
  const rows = [
    sellable({ id: "3", title: "Gamma", sortOrder: 2 }),
    sellable({ id: "1", title: "Alpha", sortOrder: 0 }),
    sellable({ id: "2b", title: "Beta two", sortOrder: 1 }),
    sellable({ id: "2a", title: "Beta one", sortOrder: 1 }),
  ];
  const a = buildAiSearchDocument(baseInput(rows));
  const b = buildAiSearchDocument(baseInput([...rows].reverse()));
  assert.equal(a, b);
  const order = ["Alpha", "Beta one", "Beta two", "Gamma"].map((t) => a.indexOf(t));
  assert.deepEqual([...order].sort((x, y) => x - y), order);
  assert.ok(order.every((i) => i >= 0));
});

test("F1: the offerings section is length capped (count, description, total)", () => {
  const long = "x".repeat(5000);
  const many = Array.from({ length: 40 }, (_, i) =>
    sellable({ id: String(i).padStart(3, "0"), title: `Service number ${i}`, sortOrder: i, description: long }),
  );
  const doc = buildAiSearchDocument(baseInput(many));
  const lines = doc.split("\n").filter((l) => l.startsWith("Service: "));
  assert.ok(lines.length > 0);
  assert.ok(lines.length <= AI_DOC_OFFERINGS_MAX, `at most ${AI_DOC_OFFERINGS_MAX} services, got ${lines.length}`);
  for (const l of lines) {
    assert.ok(!l.includes("x".repeat(AI_DOC_OFFERING_DESCRIPTION_MAX + 1)), "description truncated");
  }
  const sectionLength = lines.join("\n").length;
  assert.ok(sectionLength <= AI_DOC_OFFERINGS_SECTION_MAX, `section ${sectionLength} > ${AI_DOC_OFFERINGS_SECTION_MAX}`);
  assert.match(doc, /Service number 0/);
});

test("F1: no offerings leaves the document byte-identical to before", () => {
  const without = buildAiSearchDocument({ ...baseInput([]), offerings: undefined });
  assert.equal(buildAiSearchDocument(baseInput([])), without);
  assert.doesNotMatch(without, /Service:/);
});
