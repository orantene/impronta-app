import assert from "node:assert/strict";
import { test } from "node:test";

import { validateThemePatch } from "../index";

import {
  CARD_KITS,
  CARD_KIT_SLUGS,
  getCardKit,
  listCardKits,
} from "./card-kits";

test("every card kit is a valid theme patch (real registry keys + values)", () => {
  for (const slug of CARD_KIT_SLUGS) {
    const res = validateThemePatch(CARD_KITS[slug].tokens);
    assert.ok(
      res.ok,
      `card kit '${slug}' is not a valid theme patch: ${JSON.stringify(
        res.ok ? {} : { rejected: res.rejected, reasons: res.reasons },
      )}`,
    );
  }
});

test("every card kit sets the SAME token keys (so switching kits fully repaints)", () => {
  const keySets = CARD_KIT_SLUGS.map((s) =>
    Object.keys(CARD_KITS[s].tokens).sort().join(","),
  );
  for (const ks of keySets) {
    assert.equal(
      ks,
      keySets[0],
      "all card kits must set the same keys; otherwise switching kits leaves stale colors",
    );
  }
});

test("every card kit re-skins the directory card family", () => {
  for (const slug of CARD_KIT_SLUGS) {
    assert.ok(
      CARD_KITS[slug].tokens["template.directory-card-family"],
      `card kit '${slug}' must set template.directory-card-family`,
    );
  }
});

test("getCardKit / listCardKits resolve known slugs and reject unknown", () => {
  assert.equal(getCardKit("editorial-noir")?.slug, "editorial-noir");
  assert.equal(getCardKit("not-a-kit"), null);
  assert.equal(listCardKits().length, CARD_KIT_SLUGS.length);
});
