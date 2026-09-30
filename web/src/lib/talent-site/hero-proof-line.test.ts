/**
 * Release 2.5, HE-2 and HE-3: the hero eyebrow ("Nail Artist · Mérida") and the
 * proof line under the hero buttons. Both come from the talent's own profile,
 * drop missing parts instead of inventing them, and have a Spanish form that
 * swaps in at render time like the rest of the applied copy.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { talentProfileTokens } from "./token-projection";
import { formatHeroEyebrow, formatHeroProofLine, languageEndonym } from "./hero-proof-line";
import { buildTalentLocaleSwaps } from "./talent-locale-swaps";
import { hydrateTalentTree } from "./default-talent-tree";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

test("the proof line: years, languages by their own names, rating and reviews", () => {
  const input = { years: 9, languages: ["Spanish", "English"], rating: 4.86, count: 212 };
  assert.equal(formatHeroProofLine(input, "en"), "9 years of craft · Español · English · ★ 4.9 · 212 reviews");
  assert.equal(formatHeroProofLine(input, "es"), "9 años de oficio · Español · English · ★ 4.9 · 212 reseñas");
});

test("every part drops out when unknown, and a new profile gets a shorter line, never a placeholder", () => {
  assert.equal(formatHeroProofLine({}), "");
  assert.equal(formatHeroProofLine({ years: 0, languages: [], rating: 0, count: 0 }), "");
  assert.equal(formatHeroProofLine({ years: 1 }, "en"), "1 year of craft");
  assert.equal(formatHeroProofLine({ years: 1 }, "es"), "1 año de oficio");
  assert.equal(formatHeroProofLine({ languages: ["Spanish"] }), "Español");
  // A rating without a review count (or the reverse) is not shown: one number alone proves nothing.
  assert.equal(formatHeroProofLine({ rating: 5 }), "");
  assert.equal(formatHeroProofLine({ count: 12 }), "");
  assert.equal(formatHeroProofLine({ rating: 4.5, count: 1 }, "en"), "★ 4.5 · 1 review");
  assert.equal(formatHeroProofLine({ languages: ["Spanish", "spanish", " Español "] }), "Español", "the same language is listed once");
});

test("a demo talent's reviews read 'demo reviews' (never passed off as real)", () => {
  assert.equal(formatHeroProofLine({ rating: 4.9, count: 212, demo: true }, "en"), "★ 4.9 · 212 demo reviews");
  assert.equal(formatHeroProofLine({ rating: 4.9, count: 212, demo: true }, "es"), "★ 4.9 · 212 reseñas de demo");
});

test("no em dashes or hex in the generated copy", () => {
  const all = [
    formatHeroProofLine({ years: 9, languages: ["Spanish", "Mayan"], rating: 4.9, count: 3, demo: true }, "en"),
    formatHeroProofLine({ years: 9, languages: ["Spanish", "Mayan"], rating: 4.9, count: 3, demo: true }, "es"),
  ].join(" ");
  assert.doesNotMatch(all, /—|–|#[0-9a-f]{6}/i);
  assert.equal(languageEndonym("German"), "Deutsch");
  assert.equal(languageEndonym("Zapotec"), "Zapotec");
});

test("the eyebrow is the trade and the city, whichever exist", () => {
  assert.equal(formatHeroEyebrow("Nail Artist", "Mérida"), "Nail Artist · Mérida");
  assert.equal(formatHeroEyebrow("Nail Artist", null), "Nail Artist");
  assert.equal(formatHeroEyebrow("", "Mérida"), "Mérida");
  assert.equal(formatHeroEyebrow(undefined, undefined), "");
});

const profile = {
  displayName: "Alba",
  profileCode: "TAL-1",
  primaryTypeLabel: "Nail Artist",
  publicBio: null,
  homeCity: "Mérida",
  serviceAreaLabels: [],
  serviceNames: ["Russian manicure"],
  headshotUrl: null,
  languagesLabel: "Spanish · English",
  experienceYears: 9,
  ratingAvg: 4.9,
  ratingCount: 212,
  isDemo: false,
};

test("the token projection fills heroEyebrow and proofLine from the profile", () => {
  const t = talentProfileTokens(profile, []);
  assert.equal(t.heroEyebrow, "Nail Artist · Mérida");
  assert.equal(t.proofLine, "9 years of craft · Español · English · ★ 4.9 · 212 reviews");
  // No city, no facts: the eyebrow is the trade alone and the proof line is empty.
  const bare = talentProfileTokens({ ...profile, homeCity: null, languagesLabel: "", experienceYears: null, ratingAvg: null, ratingCount: null }, []);
  assert.equal(bare.heroEyebrow, "Nail Artist");
  assert.equal(bare.proofLine, "");
});

test("hydration puts both tokens into the tree, and an empty proof line leaves an empty (prunable) paragraph", () => {
  const tree = [
    { id: "p1", kind: "paragraph", props: { text: "{{heroEyebrow}}" } },
    { id: "p2", kind: "paragraph", props: { text: "{{proofLine}}" } },
  ] as unknown as BuilderNode[];
  const full = hydrateTalentTree(tree, talentProfileTokens(profile, []));
  assert.equal((full[0]!.props as { text: string }).text, "Nail Artist · Mérida");
  assert.match((full[1]!.props as { text: string }).text, /9 years of craft/);
  // Older token sets (no heroEyebrow) fall back to the trade, never to a raw {{token}}.
  const legacy = { ...talentProfileTokens(profile, []) } as Record<string, unknown>;
  delete legacy.heroEyebrow;
  delete legacy.proofLine;
  const old = hydrateTalentTree(tree, legacy as unknown as ReturnType<typeof talentProfileTokens>);
  assert.equal((old[0]!.props as { text: string }).text, "Nail Artist");
  assert.equal((old[1]!.props as { text: string }).text, "");
});

test("the Spanish swap maps the baked English eyebrow and proof line; English and other locales get no swap", () => {
  const src = {
    bioI18n: null,
    typeNames: [{ en: "Nail Artist", es: "Manicurista" }],
    homeCity: { en: "Merida", es: "Mérida" },
    proof: { years: 9, languages: ["Spanish", "English"], rating: 4.86, count: 212 },
  };
  const es = buildTalentLocaleSwaps(src, "es");
  assert.equal(es["Nail Artist · Merida"], "Manicurista · Mérida");
  assert.equal(
    es["9 years of craft · Español · English · ★ 4.9 · 212 reviews"],
    "9 años de oficio · Español · English · ★ 4.9 · 212 reseñas",
  );
  const en = buildTalentLocaleSwaps(src, "en");
  assert.equal(en["9 years of craft · Español · English · ★ 4.9 · 212 reviews"], undefined);
  // The swap is keyed on facts, so an unknown-facts site (no `proof`) simply gets no proof swap.
  assert.equal(Object.keys(buildTalentLocaleSwaps({ ...src, proof: undefined }, "es")).some((k) => k.includes("years of craft")), false);
});
