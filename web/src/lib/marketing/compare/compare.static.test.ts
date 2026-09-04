import assert from "node:assert/strict";
import { test } from "node:test";
import { COMPARISONS, comparisonContent, comparisonPaths } from "./index";

/**
 * Comparison pages make dated, sourced claims about other companies' pricing.
 * That is a factual and legal exposure, so the rules that keep it defensible
 * are tested rather than trusted to whoever edits next.
 */

test("every comparison is dated and sourced", () => {
  for (const c of COMPARISONS) {
    assert.ok(
      c.pricingCheckedOn.trim().length > 0,
      `${c.key}: a comparison without a checked-on date is a claim about today that nobody checked today.`,
    );
    assert.ok(
      c.sources.length > 0,
      `${c.key}: cite the competitor's own public page so a reader can verify us.`,
    );
    for (const s of c.sources) {
      assert.match(s.url, /^https:\/\//, `${c.key}: sources must be real https links`);
    }
  }
});

test("every comparison says where the competitor is stronger", () => {
  for (const c of COMPARISONS) {
    for (const locale of ["en", "es"]) {
      const content = comparisonContent(c, locale);
      assert.ok(
        content.honest.length >= 2,
        `${c.key} (${locale}): a comparison that never concedes anything is not believable, ` +
          `and the reader already knows what the competitor is good at.`,
      );
    }
  }
});

/**
 * Disparagement is both bad persuasion and a complaint we would lose. State
 * numbers; do not characterise the other company.
 */
const BANNED = [
  "scam", "rip off", "ripoff", "greedy", "dishonest", "cheat", "lying", "liar",
  "estafa", "fraude", "avaricios", "deshonest", "mentiros",
];

test("no disparagement of competitors", () => {
  for (const c of COMPARISONS) {
    for (const locale of ["en", "es"]) {
      const content = comparisonContent(c, locale);
      const blob = JSON.stringify(content).toLowerCase();
      for (const word of BANNED) {
        assert.ok(
          !blob.includes(word),
          `${c.key} (${locale}): contains "${word}". State facts and let the numbers argue.`,
        );
      }
    }
  }
});

test("no em dashes, per the house copy rule", () => {
  for (const c of COMPARISONS) {
    const blob = JSON.stringify(c);
    assert.ok(!blob.includes("—"), `${c.key}: em dash in user-facing copy`);
    assert.ok(!blob.includes("–"), `${c.key}: en dash in user-facing copy`);
  }
});

test("slugs and paths are unique and well formed", () => {
  const en = new Set<string>();
  const es = new Set<string>();
  for (const c of COMPARISONS) {
    assert.match(c.slugEn, /^[a-z0-9-]+$/, `${c.key}: bad EN slug`);
    assert.match(c.slugEs, /^[a-z0-9-]+$/, `${c.key}: bad ES slug`);
    assert.ok(!en.has(c.slugEn), `duplicate EN slug ${c.slugEn}`);
    assert.ok(!es.has(c.slugEs), `duplicate ES slug ${c.slugEs}`);
    en.add(c.slugEn);
    es.add(c.slugEs);

    const paths = comparisonPaths(c);
    assert.equal(paths.enPath, `/compare/${c.slugEn}`);
    assert.equal(paths.esPath, `/comparar/${c.slugEs}`);
  }
});

test("a sourcing caveat, when present, is written in both languages", () => {
  for (const c of COMPARISONS) {
    if (!c.sourceCaveat) continue;
    assert.ok(
      c.sourceCaveat.en.trim().length > 0 && c.sourceCaveat.es.trim().length > 0,
      `${c.key}: a caveat that only appears in one language hides the limitation ` +
        `from half the readers it was written for.`,
    );
  }
});

test("both languages carry the same comparison rows", () => {
  for (const c of COMPARISONS) {
    assert.equal(
      c.en.rows.length,
      c.es.rows.length,
      `${c.key}: the languages disagree on how many things are being compared, ` +
        `which means one of them is telling a reader something the other does not.`,
    );
  }
});
