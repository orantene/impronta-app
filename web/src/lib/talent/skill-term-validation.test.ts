import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { invalidSkillTerms, type SkillTermFacts } from "./skill-term-validation";

const term = (over: Partial<SkillTermFacts> & { slug: string }): SkillTermFacts => ({
  term_type: "talent_type",
  is_active: true,
  is_generic_fallback: false,
  ...over,
});

// The 13 real generic-fallback talent types, e.g. dancer / model / influencer.
const DANCER = term({ slug: "dancer", is_generic_fallback: true });
const CONTENT_CREATOR = term({ slug: "content-creator", is_generic_fallback: true });
const INFLUENCER = term({ slug: "influencer", is_generic_fallback: true });
const LATIN_DANCER = term({ slug: "latin-dancer" });
const NIGHTLIFE_DANCER = term({ slug: "nightlife-dancer" });

const catalog = (...pairs: [string, SkillTermFacts][]) => new Map(pairs);

describe("invalidSkillTerms", () => {
  it("rejects a NEW generic-fallback pick", () => {
    assert.deepEqual(
      invalidSkillTerms(["d"], catalog(["d", DANCER]), new Set()),
      ["dancer"],
    );
  });

  it("rejects a NEW inactive pick", () => {
    const retired = term({ slug: "retired-type", is_active: false });
    assert.deepEqual(
      invalidSkillTerms(["r"], catalog(["r", retired]), new Set()),
      ["retired-type"],
    );
  });

  // The 2026-08-16 regression: berni's persisted `dancer` vetoed her new picks.
  it("does NOT reject a generic-fallback term already on the profile", () => {
    assert.deepEqual(
      invalidSkillTerms(["d"], catalog(["d", DANCER]), new Set(["d"])),
      [],
    );
  });

  it("lets a talent whose primary is generic ADD specific roles (berni)", () => {
    const desired = ["d", "latin", "night"];
    const facts = catalog(
      ["d", DANCER],
      ["latin", LATIN_DANCER],
      ["night", NIGHTLIFE_DANCER],
    );
    assert.deepEqual(invalidSkillTerms(desired, facts, new Set(["d"])), []);
  });

  // Eli: both roles generic, so every removal payload was still all-generic.
  it("lets a wholly-generic profile REMOVE one of its roles (Eli)", () => {
    const facts = catalog(["cc", CONTENT_CREATOR], ["inf", INFLUENCER]);
    const persisted = new Set(["cc", "inf"]);
    // Dropping `inf` leaves a payload of one generic term — must still pass.
    assert.deepEqual(invalidSkillTerms(["cc"], facts, persisted), []);
    // And the mirror direction.
    assert.deepEqual(invalidSkillTerms(["inf"], facts, persisted), []);
  });

  it("still rejects a non-talent_type term even when persisted", () => {
    const group = term({ slug: "influencers-creators", term_type: "category_group" });
    assert.deepEqual(
      invalidSkillTerms(["g"], catalog(["g", group]), new Set(["g"])),
      ["influencers-creators"],
    );
  });

  it("rejects an unknown id by raw id", () => {
    assert.deepEqual(invalidSkillTerms(["ghost"], catalog(), new Set()), ["ghost"]);
  });

  it("reports every offender, not just the first", () => {
    const facts = catalog(["d", DANCER], ["cc", CONTENT_CREATOR], ["latin", LATIN_DANCER]);
    assert.deepEqual(
      invalidSkillTerms(["d", "cc", "latin"], facts, new Set()),
      ["dancer", "content-creator"],
    );
  });

  it("empty desired set is valid", () => {
    assert.deepEqual(invalidSkillTerms([], catalog(), new Set()), []);
  });
});
