import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  hasMaisonLivePending,
  isMaisonLivePending,
  type MaisonLivePending,
} from "./maison-pending-design";

const sample: MaisonLivePending = {
  kind: "live_pending",
  source: "colors_only",
  created_at: "2026-09-26T12:00:00Z",
  proposed: {
    designSlug: "maison",
    lookSlug: "maison-pearl",
    paletteKey: "pearl",
    contentMode: "mine",
    demoSlug: "nails",
  },
  liveBaseline: {
    theme_look_slug: "maison-lilac",
    custom_palette: null,
    design_tokens_draft: {},
    menu_style: "tabs",
    theme_design_slug: "maison",
  },
};

describe("maison-pending-design (W67)", () => {
  test("recognises live pending shape", () => {
    assert.equal(isMaisonLivePending(sample), true);
    assert.equal(hasMaisonLivePending(sample), true);
  });

  test("rejects never-published Undo shape", () => {
    assert.equal(
      isMaisonLivePending({
        source: "apply",
        previous: {},
        applied: {},
        created_at: "2026-09-26T12:00:00Z",
      }),
      false,
    );
  });
});
