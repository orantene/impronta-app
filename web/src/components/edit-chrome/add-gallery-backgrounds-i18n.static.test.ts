/**
 * add-gallery-backgrounds-i18n.static.test.ts — Spanish parity for the
 * Backgrounds story's gallery cards.
 *
 * WHY IT LIVES HERE AND NOT NEXT TO THE CARDS. The card registry is under
 * `lib/site-admin/add-gallery`, but `ES_TEXT` is under
 * `components/edit-chrome`, and `lib-edit-chrome-cycle-guard.static.test.ts`
 * forbids that direction of import. So the data lives there and the language
 * assertion lives here, which is also where the sibling
 * `add-gallery-card-i18n.static.test.ts` already sits.
 *
 * WHY IT IS WORTH ASSERTING AT ALL. Card copy is translated at the render
 * boundary by `useGalleryCardState` (`t(item.label)`), which is a DYNAMIC call
 * — the wave-0 ES parity guard cannot see it, and a missing entry falls back to
 * English with no error. Most add-gallery card copy is untranslated today
 * precisely because nothing ever failed. These four cards do not join that set.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { ADD_GALLERY_BACKGROUND_ITEMS } from "@/lib/site-admin/add-gallery/registry-catalog-backgrounds";
import { ADD_GALLERY_CATEGORIES } from "@/lib/site-admin/add-gallery/registry";

import { ES_TEXT } from "./editor-i18n-es";

test("every background card label + description is translated to Spanish", () => {
  const missing: string[] = [];
  for (const item of ADD_GALLERY_BACKGROUND_ITEMS) {
    for (const [field, value] of [
      ["label", item.label],
      ["description", item.description],
    ] as const) {
      if (!ES_TEXT[value]?.trim()) missing.push(`${item.id}.${field}  "${value}"`);
    }
  }
  assert.equal(
    missing.length,
    0,
    `Add each of these to ES_TEXT (editor-i18n-es-inspectors-2.ts):\n${missing.join("\n")}`,
  );
});

test("the Backgrounds category label is translated", () => {
  const category = ADD_GALLERY_CATEGORIES.find((c) => c.id === "backgrounds");
  assert.ok(category);
  assert.ok(
    ES_TEXT[category.label]?.trim(),
    `The "${category.label}" rail label has no ES entry, so the Spanish gallery shows an English tab.`,
  );
});

test("background ES copy carries no em dashes (owner copy rule)", () => {
  const offenders: string[] = [];
  const sources = [
    ...ADD_GALLERY_BACKGROUND_ITEMS.flatMap((item) => [item.label, item.description]),
    "Backgrounds",
  ];
  for (const source of sources) {
    const es = ES_TEXT[source];
    if (es?.includes("—")) offenders.push(`"${source}" -> "${es}"`);
  }
  assert.equal(offenders.length, 0, offenders.join("\n"));
});

test("the background inspector card's own copy is translated", () => {
  // The Content-tab card (`inspectors/background-media-card.tsx`) hands its
  // copy to the inspector kit as `label`/`title`/`hint` props, so the WAVE 4.4
  // boundary guard covers most of it — but its Card head strings and the two
  // error banners are rendered as children, which that guard cannot see.
  const missing = [
    "Background",
    "Video or YouTube behind this block",
    "That is not a YouTube video link, so nothing will play. Copy the URL from the video page or the Share button.",
    "That video link cannot be used. Pick a file from the library, or paste an https URL.",
  ].filter((key) => !ES_TEXT[key]?.trim());
  assert.equal(missing.length, 0, `Missing ES entries:\n${missing.join("\n")}`);
});
