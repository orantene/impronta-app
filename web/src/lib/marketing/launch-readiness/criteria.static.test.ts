import assert from "node:assert/strict";
import { test } from "node:test";
import { LAUNCH_READINESS_CRITERIA, criterionCopy } from "./criteria";

/**
 * These criteria decide whether a real business's page is offered to search.
 * The rules that keep them usable are tested, because a checklist that drifts
 * into judgement calls stops being a gate and becomes an argument.
 */

test("every criterion is written in both languages", () => {
  for (const c of LAUNCH_READINESS_CRITERIA) {
    for (const locale of ["en", "es"]) {
      const copy = criterionCopy(c, locale);
      assert.ok(copy.label.trim(), `${c.key}: missing ${locale} label`);
      assert.ok(
        copy.stillNeeds.trim(),
        `${c.key}: missing ${locale} stillNeeds. A tenant who reads Spanish would ` +
          `be told their page is not ready and not told why.`,
      );
    }
  }
});

test("every criterion records why it exists", () => {
  for (const c of LAUNCH_READINESS_CRITERIA) {
    assert.ok(
      c.rationale.trim().length > 40,
      `${c.key}: no rationale. Without one, the next person deletes an item ` +
        `without knowing what it was protecting against.`,
    );
  }
});

/**
 * The gate has to be answerable by looking. "Looks professional" is two people
 * disagreeing; "has a price" is a yes or a no.
 */
const SUBJECTIVE = [
  "professional", "polished", "high quality", "good enough", "attractive",
  "profesional", "pulido", "de calidad", "atractiv",
];

test("no criterion is a judgement call", () => {
  for (const c of LAUNCH_READINESS_CRITERIA) {
    for (const locale of ["en", "es"]) {
      const label = criterionCopy(c, locale).label.toLowerCase();
      for (const word of SUBJECTIVE) {
        assert.ok(
          !label.includes(word),
          `${c.key} (${locale}): "${word}" makes this a conversation rather than a gate.`,
        );
      }
    }
  }
});

test("the contact criterion demands delivery, not presence", () => {
  const contact = LAUNCH_READINESS_CRITERIA.find((c) => c.key === "reachable-contact");
  assert.ok(contact, "the contact criterion is missing");
  // Hardened from our own failure: tulala.digital had no MX record while
  // /support told every visitor to email us. "Has a contact method" would have
  // passed a page that could not be contacted.
  assert.match(
    contact!.en.label + contact!.en.stillNeeds,
    /shown to work|shown to|deliver|test/i,
    "This must require a channel proven to RECEIVE. Presence is what failed us.",
  );
  assert.match(contact!.rationale, /MX/, "Keep the reason recorded, or it softens back to presence.");
});

test("no em dashes in tenant-facing copy", () => {
  for (const c of LAUNCH_READINESS_CRITERIA) {
    const blob = JSON.stringify([c.en, c.es]);
    assert.ok(!blob.includes("—") && !blob.includes("–"), `${c.key}: dash in copy`);
  }
});
