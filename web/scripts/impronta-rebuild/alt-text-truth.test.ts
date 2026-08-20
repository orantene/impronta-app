import assert from "node:assert/strict";
import test from "node:test";

import { homePage } from "./pages/home";
import { aboutPage } from "./pages/about";
import { contactPage } from "./pages/contact";
import { forClientsPage } from "./pages/for-clients";
import { becomeAModelPage } from "./pages/become-a-model";
import { faqPage } from "./pages/faq";
import { fashionModelsPage } from "./pages/fashion-models";
import { hostsPromotersPage } from "./pages/hosts-promoters";
import { performersPage } from "./pages/performers";
import { musicDjsPage } from "./pages/music-djs";
import type { ImprontaRebuildPage } from "./shared";

/**
 * Every page this seeder actually publishes. `chefs-culinary` is deliberately
 * absent: it is on owner hold, it has no pinned imagery, and its alt text has
 * to be written against whatever photographs exist on the day it ships. Add it
 * here in the same commit that takes it off hold.
 */
const SEEDED: ImprontaRebuildPage[] = [
  homePage,
  aboutPage,
  contactPage,
  forClientsPage,
  becomeAModelPage,
  faqPage,
  fashionModelsPage,
  hostsPromotersPage,
  performersPage,
  musicDjsPage,
];

/**
 * Words that describe a PLACE OR AN EVENT the photograph would have to have
 * been taken at.
 *
 * Every pinned image in this tenant's library is a studio portrait on white or
 * tan seamless. The rebuilt pages nonetheless described fire performers on
 * night beaches, aerialists over jungle weddings, DJs behind decks and models
 * at golden hour on the coast - 33 alt strings, none of which matched their
 * image. Alt text is what a screen-reader user is told the page contains and
 * what a search engine indexes it as, so this was not decoration; it was the
 * site describing itself falsely to the people who cannot see it.
 *
 * The rule this pins is narrow and mechanical: an alt may describe the person,
 * the clothing, the pose and the backdrop, because those are visible in a
 * studio frame. It may not place them somewhere. When the agency shoots real
 * location work, delete the word here in the same commit that adds the
 * photograph - the list is meant to be edited, not worked around.
 */
const SCENE_WORDS = [
  "beach", "shoreline", "coast", "sea", "sand", "sunset", "golden hour", "dusk",
  "rooftop", "jungle", "villa", "venue", "club", "stage", "backstage", "runway",
  "crowd", "guests", "wedding", "reception", "on set", "on location", "activation",
  "launch", "market", "booth", "decks", "casting day", "candlelit", "lantern",
  "night sky", "open-air", "resort",
];

function altStrings(page: ImprontaRebuildPage): Array<{ text: string; id: string }> {
  const out: Array<{ text: string; id: string }> = [];
  const walk = (v: unknown, id: string): void => {
    if (Array.isArray(v)) return v.forEach((x) => walk(x, id));
    if (!v || typeof v !== "object") return;
    const node = v as Record<string, unknown>;
    const here = typeof node.id === "string" ? node.id : id;
    for (const [k, entry] of Object.entries(node)) {
      if ((k === "alt" || k === "imageAlt") && typeof entry === "string" && entry.trim()) {
        out.push({ text: entry, id: here });
      } else walk(entry, here);
    }
  };
  walk(page.tree, page.slug);
  return out;
}

test("no alt text places a studio portrait somewhere it was not taken", () => {
  const lies: string[] = [];
  for (const page of SEEDED) {
    for (const { text, id } of altStrings(page)) {
      const lower = text.toLowerCase();
      // Word boundaries, not substrings: "seated" contains "sea", and a guard
      // that flags the true description is a guard people learn to ignore.
      const hit = SCENE_WORDS.find((w) =>
        new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lower),
      );
      if (hit) lies.push(`${page.slug} [${id}] claims "${hit}": ${text}`);
    }
  }
  assert.deepEqual(lies, [], `alt text describes scenes the library has no photograph of:\n${lies.join("\n")}`);
});

test("every image still has alt text at all", () => {
  // The opposite failure: an empty alt is a publish blocker elsewhere in the
  // product, and silence is not an improvement on fiction.
  for (const page of SEEDED) {
    for (const { text, id } of altStrings(page)) {
      assert.ok(text.trim().length > 12, `${page.slug} [${id}]: alt is too short to be useful`);
    }
  }
});
